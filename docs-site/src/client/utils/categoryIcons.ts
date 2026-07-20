// ---------------------------------------------------------------------------
// categoryIcons — Emoji icons for documentation categories
// ---------------------------------------------------------------------------

/**
 * Get emoji icon for category by ID
 * Matches categories defined in inventory.json
 */
export function getCategoryIcon(categoryId: string): string {
  const icons: Record<string, string> = {
    maestro: '🤖',
    spec: '📋',
    quality: '✅',
    manage: '⚙️',
    odyssey: '🏔️',
    team: '👥',
    learn: '📖',
    wiki: '🗺️',
    scholar: '🎓',
    meta: '🔧',
  };
  return icons[categoryId] || '📁';
}
