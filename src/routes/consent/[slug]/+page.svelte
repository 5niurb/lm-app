<script>
	import { page } from '$app/stores';
	import { PUBLIC_API_URL } from '$env/static/public';

	const API_URL = PUBLIC_API_URL || 'http://localhost:3001';

	/** @type {any} */
	let content = $state(null);
	let loading = $state(true);
	let error = $state('');

	// Form state
	let clientName = $state('');
	let clientEmail = $state('');
	let clientPhone = $state('');
	/** @type {Record<string, string>} */
	let responses = $state({});
	let agreedToTerms = $state(false);

	// Signature state
	/** @type {HTMLCanvasElement|null} */
	let signatureCanvas = $state(null);
	/** @type {CanvasRenderingContext2D|null} */
	let ctx = $state(null);
	let isDrawing = $state(false);
	let hasSignature = $state(false);
	let lastX = $state(0);
	let lastY = $state(0);

	// Submission state
	let submitting = $state(false);
	let submitted = $state(false);
	let submitError = $state('');

	const slug = $derived($page.params.slug);

	// Check for client_id in URL params (from automation links)
	const clientId = $derived($page.url.searchParams.get('cid') || '');

	$effect(() => {
		if (slug) loadContent(slug);
	});

	$effect(() => {
		if (signatureCanvas && !ctx) {
			initCanvas();
		}
	});

	async function loadContent(s) {
		loading = true;
		error = '';
		try {
			const res = await fetch(`${API_URL}/api/public/consent/${s}`);
			if (!res.ok) {
				if (res.status === 404) {
					error = 'not_found';
				} else {
					error = 'Failed to load consent form';
				}
				return;
			}
			const json = await res.json();
			content = json.data;

			// Initialize responses for questionnaire sections
			if (content?.content_json) {
				const r = {};
				content.content_json.forEach((section, i) => {
					if (section.type === 'checkbox' || section.type === 'radio' || section.type === 'text') {
						r[`q_${i}`] = '';
					}
				});
				responses = r;
			}
		} catch {
			error = 'Unable to connect to server';
		} finally {
			loading = false;
		}
	}

	function initCanvas() {
		if (!signatureCanvas) return;
		ctx = signatureCanvas.getContext('2d');
		if (!ctx) return;

		// Set canvas dimensions for retina
		const rect = signatureCanvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		signatureCanvas.width = rect.width * dpr;
		signatureCanvas.height = rect.height * dpr;
		ctx.scale(dpr, dpr);

		// Style
		ctx.strokeStyle = '#c5a55a';
		ctx.lineWidth = 2;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		// Touch events
		signatureCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
		signatureCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
		signatureCanvas.addEventListener('touchend', handleEnd);

		// Mouse events
		signatureCanvas.addEventListener('mousedown', handleMouseDown);
		signatureCanvas.addEventListener('mousemove', handleMouseMove);
		signatureCanvas.addEventListener('mouseup', handleEnd);
		signatureCanvas.addEventListener('mouseleave', handleEnd);
	}

	function getCanvasPos(e) {
		if (!signatureCanvas) return { x: 0, y: 0 };
		const rect = signatureCanvas.getBoundingClientRect();
		return {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top
		};
	}

	function getTouchPos(e) {
		if (!signatureCanvas) return { x: 0, y: 0 };
		const rect = signatureCanvas.getBoundingClientRect();
		const touch = e.touches[0];
		return {
			x: touch.clientX - rect.left,
			y: touch.clientY - rect.top
		};
	}

	function handleMouseDown(e) {
		isDrawing = true;
		const pos = getCanvasPos(e);
		lastX = pos.x;
		lastY = pos.y;
	}

	function handleMouseMove(e) {
		if (!isDrawing || !ctx) return;
		const pos = getCanvasPos(e);
		ctx.beginPath();
		ctx.moveTo(lastX, lastY);
		ctx.lineTo(pos.x, pos.y);
		ctx.stroke();
		lastX = pos.x;
		lastY = pos.y;
		hasSignature = true;
	}

	function handleTouchStart(e) {
		e.preventDefault();
		isDrawing = true;
		const pos = getTouchPos(e);
		lastX = pos.x;
		lastY = pos.y;
	}

	function handleTouchMove(e) {
		e.preventDefault();
		if (!isDrawing || !ctx) return;
		const pos = getTouchPos(e);
		ctx.beginPath();
		ctx.moveTo(lastX, lastY);
		ctx.lineTo(pos.x, pos.y);
		ctx.stroke();
		lastX = pos.x;
		lastY = pos.y;
		hasSignature = true;
	}

	function handleEnd() {
		isDrawing = false;
	}

	function clearSignature() {
		if (!ctx || !signatureCanvas) return;
		const dpr = window.devicePixelRatio || 1;
		ctx.clearRect(0, 0, signatureCanvas.width / dpr, signatureCanvas.height / dpr);
		hasSignature = false;
	}

	function getSignatureData() {
		if (!signatureCanvas || !hasSignature) return null;
		return signatureCanvas.toDataURL('image/png');
	}

	// Determine which sections are informational vs questionnaire
	function getSectionType(section) {
		if (
			section.type === 'checkbox' ||
			section.type === 'radio' ||
			section.type === 'text' ||
			section.type === 'question'
		) {
			return 'question';
		}
		return 'info';
	}

	async function handleSubmit() {
		submitError = '';

		if (!hasSignature) {
			submitError = 'Please provide your signature';
			return;
		}

		if (!agreedToTerms) {
			submitError = 'Please acknowledge the consent terms';
			return;
		}

		// Require at least a name for walk-in patients
		if (!clientId && !clientName.trim()) {
			submitError = 'Please enter your full name';
			return;
		}

		submitting = true;

		try {
			const signatureData = getSignatureData();

			const body = {
				signature_data: signatureData,
				responses,
				form_id: content?.id,
				service_id: content?.service?.id
			};

			// Include client identification
			if (clientId) {
				body.client_id = clientId;
			} else {
				body.client_name = clientName.trim();
				body.client_email = clientEmail.trim() || undefined;
				body.client_phone = clientPhone.trim() || undefined;
			}

			const res = await fetch(`${API_URL}/api/public/consent/${slug}/submit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const json = await res.json();

			if (!res.ok) {
				submitError = json.error || 'Failed to submit consent form';
				return;
			}

			submitted = true;
		} catch {
			submitError = 'Unable to connect to server. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	{#if content}
		<title>{content.title} — Le Med Spa Consent</title>
		<meta
			name="description"
			content={content.summary || `${content.title} consent form — Le Med Spa, Encino CA`}
		/>
	{:else}
		<title>Consent Form — Le Med Spa</title>
	{/if}
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Inter:wght@300;400;500&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="consent-page">
	{#if loading}
		<div class="loading-container">
			<div class="loading-spinner"></div>
			<p>Loading consent form...</p>
		</div>
	{:else if error === 'not_found'}
		<div class="error-container">
			<div class="error-icon">🔍</div>
			<h1>Form Not Found</h1>
			<p>This consent form may have been moved or is no longer available.</p>
			<a href="https://lemedspa.com" class="cta-link">Visit Le Med Spa →</a>
		</div>
	{:else if error}
		<div class="error-container">
			<div class="error-icon">⚠️</div>
			<h1>Something Went Wrong</h1>
			<p>{error}</p>
			<button onclick={() => loadContent(slug)} class="cta-link">Try Again</button>
		</div>
	{:else if submitted}
		<div class="success-container">
			<header class="consent-header">
				<a href="https://lemedspa.com" class="brand-link">
					<span class="brand-text">LEMEDSPA</span>
					<span class="brand-tagline">PRIVATE · INTIMATE · EXCLUSIVE</span>
				</a>
			</header>

			<div class="success-icon">✓</div>
			<h1 class="success-title">Consent Form Submitted</h1>
			<p class="success-message">
				Thank you for completing the consent form for <strong>{content.title}</strong>. Your signed
				consent has been securely recorded.
			</p>
			<div class="success-details">
				<p>
					You may close this page. If you have any questions before your appointment, please don't
					hesitate to reach out.
				</p>
			</div>
			<div class="contact-card">
				<p class="contact-label">Questions? We're here for you.</p>
				<a href="tel:+18184633772" class="phone-link">818-4MEDSPA</a>
				<p class="phone-full">(818) 463-3772</p>
			</div>
		</div>
	{:else if content}
		<!-- Header -->
		<header class="consent-header">
			<a href="https://lemedspa.com" class="brand-link">
				<span class="brand-text">LEMEDSPA</span>
				<span class="brand-tagline">PRIVATE · INTIMATE · EXCLUSIVE</span>
			</a>
		</header>

		<!-- Form type badge -->
		<div class="type-badge">
			<span class="type-icon">📝</span>
			<span class="type-label">Informed Consent</span>
		</div>

		<!-- Title -->
		<h1 class="consent-title">{content.title}</h1>

		{#if content.service}
			<p class="service-name">{content.service.name}</p>
		{/if}

		{#if content.summary}
			<p class="form-summary">{content.summary}</p>
		{/if}

		<!-- Content Sections -->
		{#if content.content_json && content.content_json.length > 0}
			<div class="sections">
				{#each content.content_json as section, i (i)}
					{#if getSectionType(section) === 'info'}
						<div class="section" style="animation-delay: {i * 0.08}s">
							<div class="section-number">{i + 1}</div>
							<div class="section-content">
								<h2 class="section-heading">{section.heading}</h2>
								<p class="section-body">{section.body}</p>
							</div>
						</div>
					{:else}
						<div class="section question-section" style="animation-delay: {i * 0.08}s">
							<div class="section-number">?</div>
							<div class="section-content">
								<h2 class="section-heading">{section.heading}</h2>
								{#if section.body}
									<p class="section-body">{section.body}</p>
								{/if}
								{#if section.type === 'checkbox'}
									<label class="checkbox-label">
										<input
											type="checkbox"
											checked={responses[`q_${i}`] === 'yes'}
											onchange={(e) => {
												responses[`q_${i}`] = e.target.checked ? 'yes' : 'no';
												responses = responses;
											}}
										/>
										<span class="checkbox-text">{section.label || 'I acknowledge'}</span>
									</label>
								{:else if section.type === 'text'}
									<textarea
										class="response-input"
										placeholder={section.placeholder || 'Your answer...'}
										value={responses[`q_${i}`] || ''}
										oninput={(e) => {
											responses[`q_${i}`] = e.target.value;
											responses = responses;
										}}
										rows="3"
									></textarea>
								{:else if section.type === 'radio' && section.options}
									<div class="radio-group">
										{#each section.options as option (option)}
											<label class="radio-label">
												<input
													type="radio"
													name={`q_${i}`}
													value={option}
													checked={responses[`q_${i}`] === option}
													onchange={() => {
														responses[`q_${i}`] = option;
														responses = responses;
													}}
												/>
												<span class="radio-text">{option}</span>
											</label>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}

		<!-- Patient Info (for walk-in patients without client_id) -->
		{#if !clientId}
			<div class="patient-info-section">
				<h2 class="section-label">Patient Information</h2>
				<div class="form-fields">
					<div class="field">
						<label for="patient-name">Full Name <span class="required">*</span></label>
						<input
							id="patient-name"
							type="text"
							bind:value={clientName}
							placeholder="First and Last Name"
							required
						/>
					</div>
					<div class="field">
						<label for="patient-email">Email</label>
						<input
							id="patient-email"
							type="email"
							bind:value={clientEmail}
							placeholder="your@email.com"
						/>
					</div>
					<div class="field">
						<label for="patient-phone">Phone</label>
						<input
							id="patient-phone"
							type="tel"
							bind:value={clientPhone}
							placeholder="(818) 555-0123"
						/>
					</div>
				</div>
			</div>
		{/if}

		<!-- Agreement checkbox -->
		<div class="agreement-section">
			<label class="agreement-label">
				<input type="checkbox" bind:checked={agreedToTerms} />
				<span class="agreement-text">
					I have read and understand the information above. I consent to the described treatment and
					acknowledge the potential risks and benefits. I confirm that the information I have
					provided is accurate to the best of my knowledge.
				</span>
			</label>
		</div>

		<!-- Signature Pad -->
		<div class="signature-section">
			<h2 class="section-label">Your Signature</h2>
			<p class="signature-instructions">Please sign below using your finger or stylus</p>

			<div class="signature-pad-wrapper">
				<canvas
					bind:this={signatureCanvas}
					class="signature-canvas"
					class:has-signature={hasSignature}
				></canvas>
				{#if !hasSignature}
					<div class="signature-placeholder">
						<span>Sign here</span>
					</div>
				{/if}
			</div>

			<div class="signature-actions">
				<button type="button" class="clear-btn" onclick={clearSignature} disabled={!hasSignature}>
					Clear Signature
				</button>
			</div>
		</div>

		<!-- Submit -->
		{#if submitError}
			<div class="submit-error">{submitError}</div>
		{/if}

		<button class="submit-btn" onclick={handleSubmit} disabled={submitting}>
			{#if submitting}
				<span class="btn-spinner"></span>
				Submitting...
			{:else}
				Submit Consent Form
			{/if}
		</button>

		<!-- Footer -->
		<footer class="consent-footer">
			<div class="footer-note">
				<p>
					This form is securely transmitted and stored in compliance with healthcare data protection
					standards.
				</p>
			</div>

			<div class="address">
				<p>Le Med Spa</p>
				<p>17414 Ventura Blvd, Encino, CA 91316</p>
			</div>

			<div class="footer-links">
				<a href="https://lemedspa.com">lemedspa.com</a>
				<span class="dot">·</span>
				<a href="https://lemedspa.com/terms-of-service">Terms</a>
				<span class="dot">·</span>
				<a href="https://lemedspa.com/privacy-policy">Privacy</a>
			</div>

			<p class="trademark">LEMEDSPA® is a registered trademark of LM Operations.</p>
		</footer>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}

	.consent-page {
		min-height: 100vh;
		background: #0a0a0c;
		color: #e8e0d0;
		font-family:
			'Inter',
			-apple-system,
			BlinkMacSystemFont,
			sans-serif;
		padding: 0 16px 48px;
		max-width: 680px;
		margin: 0 auto;
	}

	/* Loading */
	.loading-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		gap: 16px;
		color: rgba(255, 255, 255, 0.3);
		font-size: 14px;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 2px solid rgba(197, 165, 90, 0.15);
		border-top-color: #c5a55a;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Error */
	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		text-align: center;
		gap: 12px;
	}

	.error-icon {
		font-size: 48px;
	}

	.error-container h1 {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 24px;
		font-weight: 400;
		color: white;
		margin: 0;
	}

	.error-container p {
		color: rgba(255, 255, 255, 0.4);
		font-size: 14px;
		max-width: 320px;
	}

	.cta-link {
		color: #c5a55a;
		text-decoration: none;
		font-size: 14px;
		margin-top: 8px;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
	}

	.cta-link:hover {
		color: #d4af37;
	}

	/* Success */
	.success-container {
		text-align: center;
		padding-top: 0;
	}

	.success-icon {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: rgba(74, 222, 128, 0.1);
		border: 2px solid rgba(74, 222, 128, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 28px;
		color: #4ade80;
		margin: 32px auto 16px;
	}

	.success-title {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 26px;
		font-weight: 400;
		color: white;
		margin: 0 0 12px;
	}

	.success-message {
		font-size: 15px;
		line-height: 1.6;
		color: rgba(255, 255, 255, 0.6);
		margin: 0 0 24px;
	}

	.success-message strong {
		color: #c5a55a;
	}

	.success-details {
		background: rgba(197, 165, 90, 0.04);
		border: 1px solid rgba(197, 165, 90, 0.12);
		border-radius: 12px;
		padding: 16px 20px;
		margin-bottom: 24px;
	}

	.success-details p {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.5);
		margin: 0;
		line-height: 1.6;
	}

	/* Header */
	.consent-header {
		padding: 32px 0 24px;
		text-align: center;
		border-bottom: 1px solid rgba(197, 165, 90, 0.12);
		margin-bottom: 32px;
	}

	.brand-link {
		text-decoration: none;
		display: block;
	}

	.brand-text {
		display: block;
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 20px;
		color: #c5a55a;
		letter-spacing: 4px;
		font-weight: 400;
	}

	.brand-tagline {
		display: block;
		font-size: 9px;
		letter-spacing: 3px;
		color: rgba(255, 255, 255, 0.25);
		margin-top: 6px;
	}

	/* Type badge */
	.type-badge {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		border: 1px solid rgba(197, 165, 90, 0.15);
		border-radius: 20px;
		background: rgba(197, 165, 90, 0.04);
		margin-bottom: 16px;
	}

	.type-icon {
		font-size: 14px;
	}

	.type-label {
		font-size: 11px;
		letter-spacing: 1px;
		text-transform: uppercase;
		color: rgba(197, 165, 90, 0.7);
	}

	/* Title */
	.consent-title {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 28px;
		font-weight: 400;
		color: white;
		margin: 0 0 8px;
		line-height: 1.3;
	}

	.service-name {
		font-size: 14px;
		color: rgba(197, 165, 90, 0.5);
		margin: 0 0 12px;
	}

	.form-summary {
		font-size: 14px;
		line-height: 1.7;
		color: rgba(255, 255, 255, 0.5);
		margin: 0 0 32px;
	}

	/* Sections */
	.sections {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.section {
		display: flex;
		gap: 16px;
		padding: 24px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		animation: fadeIn 0.4s ease-out forwards;
		opacity: 0;
	}

	@keyframes fadeIn {
		to {
			opacity: 1;
		}
	}

	.section:last-child {
		border-bottom: none;
	}

	.question-section {
		background: rgba(197, 165, 90, 0.02);
		padding: 24px 16px;
		margin: 0 -16px;
		border-radius: 8px;
		border-bottom: none;
	}

	.section-number {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: rgba(197, 165, 90, 0.08);
		border: 1px solid rgba(197, 165, 90, 0.15);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: #c5a55a;
		font-weight: 500;
		margin-top: 2px;
	}

	.section-content {
		flex: 1;
		min-width: 0;
	}

	.section-heading {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 17px;
		font-weight: 400;
		color: #c5a55a;
		margin: 0 0 8px;
	}

	.section-body {
		font-size: 14px;
		line-height: 1.75;
		color: rgba(255, 255, 255, 0.65);
		margin: 0;
	}

	/* Questionnaire controls */
	.checkbox-label,
	.radio-label {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		cursor: pointer;
		margin-top: 12px;
	}

	.checkbox-label input,
	.radio-label input {
		accent-color: #c5a55a;
		width: 18px;
		height: 18px;
		margin-top: 2px;
		flex-shrink: 0;
	}

	.checkbox-text,
	.radio-text {
		font-size: 14px;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.5;
	}

	.radio-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 12px;
	}

	.response-input {
		width: 100%;
		margin-top: 12px;
		padding: 12px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(197, 165, 90, 0.15);
		border-radius: 8px;
		color: white;
		font-size: 14px;
		font-family: inherit;
		resize: vertical;
		box-sizing: border-box;
	}

	.response-input::placeholder {
		color: rgba(255, 255, 255, 0.2);
	}

	.response-input:focus {
		outline: none;
		border-color: rgba(197, 165, 90, 0.4);
	}

	/* Patient info section */
	.patient-info-section {
		margin-top: 32px;
		padding: 24px;
		background: rgba(197, 165, 90, 0.03);
		border: 1px solid rgba(197, 165, 90, 0.1);
		border-radius: 12px;
	}

	.section-label {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 18px;
		font-weight: 400;
		color: #c5a55a;
		margin: 0 0 16px;
	}

	.form-fields {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.field label {
		display: block;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 1px;
		color: rgba(255, 255, 255, 0.4);
		margin-bottom: 6px;
	}

	.required {
		color: #ef4444;
	}

	.field input {
		width: 100%;
		padding: 12px 14px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(197, 165, 90, 0.15);
		border-radius: 8px;
		color: white;
		font-size: 15px;
		font-family: inherit;
		box-sizing: border-box;
	}

	.field input::placeholder {
		color: rgba(255, 255, 255, 0.2);
	}

	.field input:focus {
		outline: none;
		border-color: rgba(197, 165, 90, 0.4);
	}

	/* Agreement */
	.agreement-section {
		margin-top: 32px;
		padding: 20px;
		background: rgba(197, 165, 90, 0.04);
		border: 1px solid rgba(197, 165, 90, 0.12);
		border-radius: 12px;
	}

	.agreement-label {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		cursor: pointer;
	}

	.agreement-label input {
		accent-color: #c5a55a;
		width: 20px;
		height: 20px;
		margin-top: 2px;
		flex-shrink: 0;
	}

	.agreement-text {
		font-size: 13px;
		line-height: 1.7;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Signature */
	.signature-section {
		margin-top: 32px;
	}

	.signature-instructions {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.35);
		margin: 0 0 12px;
	}

	.signature-pad-wrapper {
		position: relative;
		border: 1px solid rgba(197, 165, 90, 0.2);
		border-radius: 12px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.02);
	}

	.signature-canvas {
		display: block;
		width: 100%;
		height: 160px;
		cursor: crosshair;
		touch-action: none;
	}

	.signature-canvas.has-signature {
		border-color: rgba(197, 165, 90, 0.35);
	}

	.signature-placeholder {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.signature-placeholder span {
		font-size: 14px;
		color: rgba(255, 255, 255, 0.15);
		letter-spacing: 1px;
	}

	.signature-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 8px;
	}

	.clear-btn {
		padding: 6px 14px;
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.4);
		font-size: 12px;
		cursor: pointer;
		font-family: inherit;
	}

	.clear-btn:hover:not(:disabled) {
		border-color: rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.6);
	}

	.clear-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	/* Submit */
	.submit-error {
		margin-top: 16px;
		padding: 12px 16px;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 8px;
		color: #f87171;
		font-size: 14px;
	}

	.submit-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		margin-top: 24px;
		padding: 16px;
		background: linear-gradient(135deg, #c5a55a 0%, #d4af37 100%);
		border: none;
		border-radius: 12px;
		color: #0a0a0c;
		font-size: 16px;
		font-weight: 500;
		font-family: inherit;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.submit-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-spinner {
		width: 18px;
		height: 18px;
		border: 2px solid rgba(10, 10, 12, 0.2);
		border-top-color: #0a0a0c;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	/* Footer */
	.consent-footer {
		margin-top: 48px;
		padding: 32px 0;
		border-top: 1px solid rgba(197, 165, 90, 0.12);
		text-align: center;
	}

	.footer-note {
		margin-bottom: 20px;
	}

	.footer-note p {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.25);
		margin: 0;
		line-height: 1.5;
	}

	.contact-card {
		background: rgba(197, 165, 90, 0.04);
		border: 1px solid rgba(197, 165, 90, 0.12);
		border-radius: 12px;
		padding: 24px;
		margin-bottom: 24px;
	}

	.contact-label {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.4);
		margin: 0 0 8px;
	}

	.phone-link {
		display: block;
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 24px;
		color: #c5a55a;
		text-decoration: none;
		margin-bottom: 4px;
	}

	.phone-link:hover {
		color: #d4af37;
	}

	.phone-full {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.25);
		margin: 0;
	}

	.address {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.3);
		margin-bottom: 16px;
		line-height: 1.6;
	}

	.address p {
		margin: 0;
	}

	.footer-links {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin-bottom: 16px;
	}

	.footer-links a {
		font-size: 12px;
		color: rgba(197, 165, 90, 0.5);
		text-decoration: none;
	}

	.footer-links a:hover {
		color: #c5a55a;
	}

	.dot {
		color: rgba(255, 255, 255, 0.15);
		font-size: 10px;
	}

	.trademark {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.15);
		margin: 0;
	}

	/* Mobile adjustments */
	@media (max-width: 480px) {
		.consent-title {
			font-size: 24px;
		}

		.section {
			gap: 12px;
		}

		.section-heading {
			font-size: 15px;
		}

		.section-body {
			font-size: 13px;
		}

		.signature-canvas {
			height: 140px;
		}
	}
</style>
