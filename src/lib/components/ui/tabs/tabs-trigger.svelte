<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		value,
		children,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	{value}
	class={cn(
		"data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</TabsPrimitive.Trigger>
