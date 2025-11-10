  // Create a valid CSS ident for view-transition-name from a URL/string
  import { goto } from '$app/navigation'
  
  export function toVTName(input: string): string {
    // ensure it starts with letters to be a safe ident
    const base = 'vt-' + input.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
    console.log('VT Name:', base)
    return base || 'vt-default'
  }

  // Programmatic navigation. The global onNavigate hook coordinates view transitions.
  export function navigate(route: string) {
    return goto(route)
  }