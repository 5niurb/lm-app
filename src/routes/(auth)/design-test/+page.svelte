<script>
	let billingCycle = $state('monthly');

	const features = [
		{
			icon: '📞',
			title: 'Call Logging',
			desc: 'Every inbound, outbound, and missed call tracked automatically.',
			bg: 'rgba(139, 92, 246, 0.12)',
			color: '#a78bfa'
		},
		{
			icon: '💬',
			title: 'Two-Way SMS',
			desc: 'Real-time messaging with clients through your business number.',
			bg: 'rgba(59, 130, 246, 0.12)',
			color: '#60a5fa'
		},
		{
			icon: '🎙️',
			title: 'Voicemail',
			desc: 'Transcribed voicemails organized by mailbox with audio playback.',
			bg: 'rgba(236, 72, 153, 0.12)',
			color: '#f472b6'
		},
		{
			icon: '👥',
			title: 'CRM & Contacts',
			desc: 'Full client profiles with tags, notes, and treatment history.',
			bg: 'rgba(34, 197, 94, 0.12)',
			color: '#4ade80'
		},
		{
			icon: '📅',
			title: 'Booking',
			desc: 'Cal.com integration for seamless appointment scheduling.',
			bg: 'rgba(251, 191, 36, 0.12)',
			color: '#fbbf24'
		},
		{
			icon: '⚡',
			title: 'Automation',
			desc: 'Message sequences and follow-ups that run on autopilot.',
			bg: 'rgba(244, 114, 182, 0.12)',
			color: '#f472b6'
		},
		{
			icon: '💳',
			title: 'Payments',
			desc: 'Stripe-powered checkout, invoices, and POS terminal.',
			bg: 'rgba(45, 212, 191, 0.12)',
			color: '#2dd4bf'
		},
		{
			icon: '📊',
			title: 'Analytics',
			desc: 'Call volume, revenue trends, and client engagement at a glance.',
			bg: 'rgba(251, 146, 60, 0.12)',
			color: '#fb923c'
		},
		{
			icon: '🔒',
			title: 'Security',
			desc: '2FA, trusted devices, geo-restrictions, and full audit logging.',
			bg: 'rgba(148, 163, 184, 0.12)',
			color: '#94a3b8'
		}
	];

	const plans = [
		{
			name: 'Starter',
			desc: 'Perfect for solo practitioners.',
			priceMonthly: 'Free',
			priceYearly: 'Free',
			cta: 'Get started',
			featured: false,
			features: ['Up to 100 contacts', 'Call logging', 'Voicemail inbox', 'Basic SMS']
		},
		{
			name: 'Professional',
			desc: 'For growing practices.',
			priceMonthly: '$49',
			priceYearly: '$39',
			cta: 'Start free trial',
			featured: true,
			features: [
				'Unlimited contacts',
				'Two-way SMS',
				'Automation sequences',
				'Booking integration',
				'Analytics dashboard'
			]
		},
		{
			name: 'Enterprise',
			desc: 'Multi-location practices.',
			priceMonthly: 'Custom',
			priceYearly: 'Custom',
			cta: 'Contact us',
			featured: false,
			features: [
				'Everything in Pro',
				'Multi-location',
				'API access',
				'Dedicated support',
				'Custom integrations'
			]
		}
	];

	const testimonials = [
		{
			name: 'Emily Roberts',
			role: 'Client',
			initials: 'ER',
			avatarBg: 'rgba(139, 92, 246, 0.15)',
			avatarColor: '#a78bfa',
			socialIcon: 'G',
			title: 'Impressed, Excited',
			stars: 5,
			quote: 'The booking experience was seamless. I love how easy it is to schedule treatments.'
		},
		{
			name: 'Ryan Thompson',
			role: 'Client',
			initials: 'RT',
			avatarBg: 'rgba(59, 130, 246, 0.15)',
			avatarColor: '#60a5fa',
			socialIcon: 'Y',
			title: 'Nice work',
			stars: 5,
			quote:
				'The results were incredible. Professional staff and a beautiful, intimate environment.'
		},
		{
			name: 'Mia Kennedy',
			role: 'Client',
			initials: 'MK',
			avatarBg: 'rgba(34, 197, 94, 0.15)',
			avatarColor: '#4ade80',
			socialIcon: 'G',
			title: 'Simple & Fun',
			stars: 5,
			quote: 'Quick, painless, and the results speak for themselves. Five stars from me.'
		},
		{
			name: 'Sophie Mitchell',
			role: 'Client',
			initials: 'SM',
			avatarBg: 'rgba(236, 72, 153, 0.15)',
			avatarColor: '#f472b6',
			socialIcon: 'I',
			title: 'My Dream',
			stars: 5,
			quote:
				'The custom treatment plan was exactly what I needed. Attention to detail is unmatched.'
		},
		{
			name: 'Anastasia Blue',
			role: 'Client',
			initials: 'AB',
			avatarBg: 'rgba(45, 212, 191, 0.15)',
			avatarColor: '#2dd4bf',
			socialIcon: 'T',
			title: 'Simple & Fun',
			stars: 5,
			quote: 'I felt so relaxed and valued. The atmosphere is private and luxurious.'
		},
		{
			name: 'Olivia Jackson',
			role: 'Client',
			initials: 'OJ',
			avatarBg: 'rgba(251, 146, 60, 0.15)',
			avatarColor: '#fb923c',
			socialIcon: 'G',
			title: 'Thanks for all',
			stars: 4,
			quote: 'Great tips on skincare and wellness. Will definitely come back for more treatments.'
		}
	];

	const articles = [
		{
			title: 'The Science Behind HydraFacial: Why It Works',
			date: '12 Feb 2026',
			readTime: '5 min read',
			gradient: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.15))'
		},
		{
			title: 'Choosing the Right Filler: A Complete Guide',
			date: '8 Feb 2026',
			readTime: '7 min read',
			gradient: 'linear-gradient(135deg, rgba(236,72,153,0.2), rgba(251,146,60,0.15))'
		},
		{
			title: 'Post-Treatment Care: What to Expect',
			date: '3 Feb 2026',
			readTime: '4 min read',
			gradient: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(45,212,191,0.15))'
		},
		{
			title: 'Skin Rejuvenation with NuEra Tight',
			date: '28 Jan 2026',
			readTime: '6 min read',
			gradient: 'linear-gradient(135deg, rgba(251,191,36,0.2), rgba(251,146,60,0.15))'
		}
	];

	const accentColors = [
		{ name: 'Violet', hex: '#a78bfa' },
		{ name: 'Sky', hex: '#60a5fa' },
		{ name: 'Rose', hex: '#f472b6' },
		{ name: 'Emerald', hex: '#4ade80' },
		{ name: 'Amber', hex: '#fbbf24' },
		{ name: 'Teal', hex: '#2dd4bf' },
		{ name: 'Orange', hex: '#fb923c' },
		{ name: 'Slate', hex: '#94a3b8' },
		{ name: 'Gold', hex: '#c5a55a' }
	];
</script>

<div class="space-y-20 pb-20">
	<!-- ═══════════════════════════════════════════
	     SECTION 1: Hero — Gradient headline
	     ═══════════════════════════════════════════ -->
	<section class="text-center max-w-3xl mx-auto pt-4">
		<p class="section-label-gold mb-4 tracking-widest">DESIGN EXPLORATION</p>
		<h1 class="text-4xl md:text-5xl leading-tight mb-4">
			Bright ideas for a
			<span class="gradient-text">bold new look</span>
		</h1>
		<p class="text-text-secondary text-lg max-w-xl mx-auto">
			Design elements inspired by LaunchDarkly's colorful icons, pricing cards, testimonials, and
			blog layouts — adapted to our dark + gold aesthetic.
		</p>
	</section>

	<!-- ═══════════════════════════════════════════
	     SECTION 2: Feature Grid — Colorful Icons
	     LaunchDarkly "Solutions" dropdown style
	     ═══════════════════════════════════════════ -->
	<section>
		<div class="mb-8">
			<p class="section-label-gold mb-2">PLATFORM</p>
			<h2 class="text-2xl">Everything you need</h2>
		</div>
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 list-enter">
			{#each features as feature (feature.title)}
				<div
					class="group relative rounded-xl border border-border-subtle bg-surface-subtle p-5 hover:border-border-default hover:bg-surface-hover transition-all duration-200 cursor-default"
				>
					<div class="flex items-start gap-4">
						<div
							class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-lg"
							style="background: {feature.bg}; color: {feature.color};"
						>
							{feature.icon}
						</div>
						<div>
							<h3 class="text-sm font-semibold text-text-primary mb-1 font-[var(--font-body)]">
								{feature.title}
							</h3>
							<p class="text-xs text-text-secondary leading-relaxed">{feature.desc}</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- ═══════════════════════════════════════════
	     SECTION 3: Pricing Cards
	     LaunchDarkly pricing style — dark cards,
	     highlight card with colored glow
	     ═══════════════════════════════════════════ -->
	<section>
		<div class="text-center mb-10">
			<h2 class="text-3xl mb-3">
				Flexible pricing for
				<span class="italic text-gold">every</span> stage
			</h2>
			<p class="text-text-secondary mb-6">Start free, upgrade when you're ready.</p>

			<!-- Billing Toggle -->
			<div
				class="inline-flex items-center rounded-full bg-surface-raised border border-border-subtle p-1 gap-1"
			>
				<button
					onclick={() => (billingCycle = 'monthly')}
					class="px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200
						{billingCycle === 'monthly'
						? 'bg-gold text-primary-foreground shadow-sm'
						: 'text-text-secondary hover:text-text-primary'}"
				>
					Monthly
				</button>
				<button
					onclick={() => (billingCycle = 'yearly')}
					class="px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200
						{billingCycle === 'yearly'
						? 'bg-gold text-primary-foreground shadow-sm'
						: 'text-text-secondary hover:text-text-primary'}"
				>
					Yearly
				</button>
			</div>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
			{#each plans as plan (plan.name)}
				<div
					class="relative rounded-2xl border p-6 flex flex-col transition-all duration-300
						{plan.featured
						? 'border-gold/40 bg-gradient-to-b from-[rgba(197,165,90,0.06)] to-transparent shadow-[0_0_30px_rgba(197,165,90,0.08)]'
						: 'border-border-subtle bg-surface-subtle hover:border-border-default'}"
				>
					{#if plan.featured}
						<div class="absolute -top-3 left-1/2 -translate-x-1/2">
							<span
								class="bg-gold text-primary-foreground text-[10px] font-semibold tracking-wider uppercase px-3 py-1 rounded-full"
							>
								Popular
							</span>
						</div>
					{/if}
					<div class="mb-4">
						<h3
							class="text-lg font-semibold text-text-primary font-[var(--font-body)] {plan.featured
								? 'text-gold'
								: ''}"
						>
							{plan.name}
						</h3>
						<p class="text-xs text-text-secondary mt-1">{plan.desc}</p>
					</div>
					<div class="mb-5">
						<span class="text-3xl font-bold text-text-primary"
							>{billingCycle === 'monthly' ? plan.priceMonthly : plan.priceYearly}</span
						>
						{#if plan.priceMonthly !== 'Free' && plan.priceMonthly !== 'Custom'}
							<span class="text-xs text-text-tertiary ml-1">/ month</span>
						{/if}
					</div>
					<button
						class="w-full rounded-lg py-2.5 text-sm font-medium transition-all duration-200 mb-5
							{plan.featured
							? 'bg-gold text-primary-foreground hover:brightness-110'
							: 'border border-border-default text-text-primary hover:bg-surface-hover'}"
					>
						{plan.cta}
					</button>
					<ul class="space-y-2.5 text-xs text-text-secondary">
						{#each plan.features as feat (feat)}
							<li class="flex items-center gap-2">
								<span class="text-status-success text-sm">&#10003;</span>
								{feat}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>

	<!-- ═══════════════════════════════════════════
	     SECTION 4: Testimonials
	     Dark cards with avatar, social badge, stars
	     ═══════════════════════════════════════════ -->
	<section>
		<div class="mb-8">
			<p class="section-label-gold mb-2">TESTIMONIALS</p>
			<h2 class="text-2xl">What our clients say</h2>
			<p class="text-text-secondary text-sm mt-2 max-w-lg">
				Real feedback from clients who trust us with their care.
			</p>
		</div>
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 list-enter">
			{#each testimonials as t (t.name)}
				<div
					class="rounded-xl border border-border-subtle bg-surface-subtle p-5 hover:border-border-default transition-all duration-200"
				>
					<div class="flex items-center justify-between mb-3">
						<div class="flex items-center gap-3">
							<div
								class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium"
								style="background: {t.avatarBg}; color: {t.avatarColor};"
							>
								{t.initials}
							</div>
							<div>
								<p class="text-sm font-medium text-text-primary">{t.name}</p>
								<p class="text-[10px] text-text-tertiary">{t.role}</p>
							</div>
						</div>
						<div
							class="w-7 h-7 rounded-full bg-surface-raised flex items-center justify-center text-text-tertiary text-xs"
						>
							{t.socialIcon}
						</div>
					</div>
					<h4 class="text-sm font-semibold text-text-primary mb-2 font-[var(--font-body)]">
						{t.title}
					</h4>
					<div class="flex gap-0.5 mb-2">
						{#each Array(t.stars) as _, starIdx (starIdx)}
							<span class="text-gold text-xs">&#9733;</span>
						{/each}
					</div>
					<p class="text-xs text-text-secondary leading-relaxed">{t.quote}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- ═══════════════════════════════════════════
	     SECTION 5: Blog / Articles Grid
	     2-column cards with image, metadata, arrow
	     ═══════════════════════════════════════════ -->
	<section>
		<div class="text-center mb-10">
			<h2 class="text-3xl italic">Blog &amp; Articles</h2>
			<p class="text-text-secondary text-sm mt-2">The latest from Le Med Spa.</p>
		</div>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto">
			{#each articles as article (article.title)}
				<div
					class="group rounded-xl border border-border-subtle bg-surface-subtle overflow-hidden hover:border-border-default transition-all duration-200 cursor-pointer"
				>
					<div class="p-4 flex items-start justify-between">
						<div>
							<h3
								class="text-sm font-medium text-text-primary group-hover:text-gold transition-colors font-[var(--font-body)]"
							>
								{article.title}
							</h3>
							<p class="text-[10px] text-text-tertiary mt-1">
								{article.date} &middot; {article.readTime}
							</p>
						</div>
						<span class="text-text-tertiary group-hover:text-gold transition-colors text-sm mt-0.5"
							>&#8599;</span
						>
					</div>
					<div class="h-40 bg-surface-raised flex items-center justify-center overflow-hidden">
						<div
							class="w-full h-full opacity-60 group-hover:opacity-80 transition-opacity duration-300"
							style="background: {article.gradient};"
						></div>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- ═══════════════════════════════════════════
	     SECTION 6: Color Palette Showcase
	     Shows the bright accent colors available
	     ═══════════════════════════════════════════ -->
	<section>
		<div class="mb-8">
			<p class="section-label-gold mb-2">COLOR PALETTE</p>
			<h2 class="text-2xl">Accent colors</h2>
			<p class="text-text-secondary text-sm mt-2">Bright pops against our dark canvas.</p>
		</div>
		<div class="flex flex-wrap gap-3">
			{#each accentColors as c (c.hex)}
				<div
					class="flex items-center gap-2.5 rounded-full border border-border-subtle bg-surface-subtle px-4 py-2 hover:border-border-default transition-all"
				>
					<div class="w-4 h-4 rounded-full" style="background: {c.hex};"></div>
					<span class="text-xs text-text-primary font-medium">{c.name}</span>
					<span class="text-[10px] text-text-tertiary font-mono">{c.hex}</span>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.gradient-text {
		background: linear-gradient(135deg, #a78bfa, #60a5fa, #f472b6, #fbbf24);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}
</style>
