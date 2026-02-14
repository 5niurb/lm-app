<script>
	import { page } from '$app/stores';
	import { PUBLIC_API_URL } from '$env/static/public';

	const API_URL = PUBLIC_API_URL || 'http://localhost:3001';

	/** @type {any} */
	let content = $state(null);
	let loading = $state(true);
	let error = $state('');

	const slug = $derived($page.params.slug);

	$effect(() => {
		if (slug) loadContent(slug);
	});

	async function loadContent(s) {
		loading = true;
		error = '';
		try {
			const res = await fetch(`${API_URL}/api/public/content/${s}`);
			if (!res.ok) {
				if (res.status === 404) {
					error = 'not_found';
				} else {
					error = 'Failed to load content';
				}
				return;
			}
			const json = await res.json();
			content = json.data;
		} catch (e) {
			error = 'Unable to connect to server';
		} finally {
			loading = false;
		}
	}

	const contentTypeLabel = {
		pre_instructions: 'Pre-Treatment Instructions',
		post_instructions: 'Post-Treatment Care',
		faq: 'Frequently Asked Questions',
		consent_form: 'Consent Information',
		promo: 'Special Offer'
	};

	function typeIcon(type) {
		switch(type) {
			case 'pre_instructions': return '📋';
			case 'post_instructions': return '💛';
			case 'faq': return '❓';
			case 'consent_form': return '📝';
			default: return '✨';
		}
	}
</script>

<svelte:head>
	{#if content}
		<title>{content.title} — Le Med Spa</title>
		<meta name="description" content={content.summary || `${content.title} at Le Med Spa, Encino CA`} />
	{:else}
		<title>Care Instructions — Le Med Spa</title>
	{/if}
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
</svelte:head>

<div class="care-page">
	{#if loading}
		<div class="loading-container">
			<div class="loading-spinner"></div>
			<p>Loading care instructions...</p>
		</div>
	{:else if error === 'not_found'}
		<div class="error-container">
			<div class="error-icon">🔍</div>
			<h1>Page Not Found</h1>
			<p>This care instruction page may have been moved or is no longer available.</p>
			<a href="https://lemedspa.com" class="cta-link">Visit Le Med Spa →</a>
		</div>
	{:else if error}
		<div class="error-container">
			<div class="error-icon">⚠️</div>
			<h1>Something Went Wrong</h1>
			<p>{error}</p>
			<button onclick={() => loadContent(slug)} class="cta-link">Try Again</button>
		</div>
	{:else if content}
		<!-- Header -->
		<header class="care-header">
			<a href="https://lemedspa.com" class="brand-link">
				<span class="brand-text">LEMEDSPA</span>
				<span class="brand-tagline">PRIVATE · INTIMATE · EXCLUSIVE</span>
			</a>
		</header>

		<!-- Content type badge -->
		<div class="type-badge">
			<span class="type-icon">{typeIcon(content.content_type)}</span>
			<span class="type-label">{contentTypeLabel[content.content_type] || content.content_type}</span>
		</div>

		<!-- Title -->
		<h1 class="care-title">{content.title}</h1>

		{#if content.service}
			<p class="service-name">{content.service.name}</p>
		{/if}

		<!-- Sections -->
		{#if content.content_json && content.content_json.length > 0}
			<div class="sections">
				{#each content.content_json as section, i}
					<div class="section" style="animation-delay: {i * 0.1}s">
						<div class="section-number">{i + 1}</div>
						<div class="section-content">
							<h2 class="section-heading">{section.heading}</h2>
							<p class="section-body">{section.body}</p>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Footer -->
		<footer class="care-footer">
			<div class="contact-card">
				<p class="contact-label">Questions? We're here for you.</p>
				<a href="tel:+18184633772" class="phone-link">818-4MEDSPA</a>
				<p class="phone-full">(818) 463-3772</p>
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

	.care-page {
		min-height: 100vh;
		background: #0a0a0c;
		color: #e8e0d0;
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
		padding: 0 16px;
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
		color: rgba(255,255,255,0.3);
		font-size: 14px;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 2px solid rgba(197,165,90,0.15);
		border-top-color: #c5a55a;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
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
		color: rgba(255,255,255,0.4);
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

	/* Header */
	.care-header {
		padding: 32px 0 24px;
		text-align: center;
		border-bottom: 1px solid rgba(197,165,90,0.12);
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
		color: rgba(255,255,255,0.25);
		margin-top: 6px;
	}

	/* Type badge */
	.type-badge {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		border: 1px solid rgba(197,165,90,0.15);
		border-radius: 20px;
		background: rgba(197,165,90,0.04);
		margin-bottom: 16px;
	}

	.type-icon {
		font-size: 14px;
	}

	.type-label {
		font-size: 11px;
		letter-spacing: 1px;
		text-transform: uppercase;
		color: rgba(197,165,90,0.7);
	}

	/* Title */
	.care-title {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 28px;
		font-weight: 400;
		color: white;
		margin: 0 0 8px;
		line-height: 1.3;
	}

	.service-name {
		font-size: 14px;
		color: rgba(197,165,90,0.5);
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
		border-bottom: 1px solid rgba(255,255,255,0.04);
		animation: fadeIn 0.4s ease-out forwards;
		opacity: 0;
	}

	@keyframes fadeIn {
		to { opacity: 1; }
	}

	.section:last-child {
		border-bottom: none;
	}

	.section-number {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: rgba(197,165,90,0.08);
		border: 1px solid rgba(197,165,90,0.15);
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
		color: rgba(255,255,255,0.65);
		margin: 0;
	}

	/* Footer */
	.care-footer {
		margin-top: 48px;
		padding: 32px 0;
		border-top: 1px solid rgba(197,165,90,0.12);
		text-align: center;
	}

	.contact-card {
		background: rgba(197,165,90,0.04);
		border: 1px solid rgba(197,165,90,0.12);
		border-radius: 12px;
		padding: 24px;
		margin-bottom: 24px;
	}

	.contact-label {
		font-size: 13px;
		color: rgba(255,255,255,0.4);
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
		color: rgba(255,255,255,0.25);
		margin: 0;
	}

	.address {
		font-size: 13px;
		color: rgba(255,255,255,0.3);
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
		color: rgba(197,165,90,0.5);
		text-decoration: none;
	}

	.footer-links a:hover {
		color: #c5a55a;
	}

	.dot {
		color: rgba(255,255,255,0.15);
		font-size: 10px;
	}

	.trademark {
		font-size: 10px;
		color: rgba(255,255,255,0.15);
		margin: 0;
	}

	/* Mobile adjustments */
	@media (max-width: 480px) {
		.care-title {
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
	}
</style>
