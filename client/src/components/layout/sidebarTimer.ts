// Shared singleton timer used by both SidebarTrigger and Sidebar.
// This ensures that moving the mouse from the trigger strip into the sidebar
// cancels the close timer, regardless of which component set it.
export const sidebarTimer: { ref: ReturnType<typeof setTimeout> | null } = { ref: null };
