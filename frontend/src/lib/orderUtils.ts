/**
 * Everest Textile Mills - Canonical Order Identifier Utilities
 *
 * Establishes a consistent factory-wide identifier convention:
 * Format: ETM-ORD-XXXXXX (e.g., ETM-ORD-000001)
 *
 * Requirements satisfied:
 * - Deterministic conversion from backend integer IDs (id: 1 -> ETM-ORD-000001)
 * - Safe support for legacy identifiers (ORD-01 -> ETM-ORD-000001)
 * - Bidirectional search matching both canonical format, legacy format, and numeric ID
 */

const ORDER_PREFIX = 'ETM-ORD-'

/**
 * Formats any raw backend numeric ID or legacy string ID into canonical ETM-ORD-XXXXXX
 */
export function formatCanonicalOrderId(rawId: number | string): string {
  if (typeof rawId === 'number') {
    return `${ORDER_PREFIX}${String(rawId).padStart(6, '0')}`
  }

  const str = String(rawId).trim()

  // Already in canonical format
  if (str.toUpperCase().startsWith('ETM-ORD-')) {
    return str.toUpperCase()
  }

  // Legacy format ORD-01 or ORD-004
  const legacyMatch = str.match(/ORD[-_]?(\d+)/i)
  if (legacyMatch) {
    const num = parseInt(legacyMatch[1], 10)
    return `${ORDER_PREFIX}${String(num).padStart(6, '0')}`
  }

  // Pure numeric string
  const num = parseInt(str, 10)
  if (!Number.isNaN(num) && num > 0) {
    return `${ORDER_PREFIX}${String(num).padStart(6, '0')}`
  }

  return str
}

/**
 * Extracts the legacy/short form (e.g. ORD-04) if applicable for secondary display
 */
export function formatLegacyOrderId(rawId: number | string): string {
  if (typeof rawId === 'number') {
    return `ORD-${String(rawId).padStart(2, '0')}`
  }
  return String(rawId)
}

/**
 * Checks whether an order matches a search query across canonical ID, legacy ID, buyer, or fabric
 */
export function matchesOrderQuery(
  order: {
    id: string
    legacyId?: string
    buyer: string
    fabric: string
    articleCode?: string
  },
  query: string
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const canonicalId = formatCanonicalOrderId(order.id).toLowerCase()
  const rawId = order.id.toLowerCase()
  const legacyId = (order.legacyId || '').toLowerCase()
  const buyer = order.buyer.toLowerCase()
  const fabric = order.fabric.toLowerCase()
  const article = (order.articleCode || '').toLowerCase()

  return (
    canonicalId.includes(q) ||
    rawId.includes(q) ||
    legacyId.includes(q) ||
    buyer.includes(q) ||
    fabric.includes(q) ||
    article.includes(q)
  )
}
