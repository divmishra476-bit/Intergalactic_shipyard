/**
 * data-normalizer.js
 * ------------------
 * Normalizes messy, inconsistent ship data from the Intergalactic Shipyard API.
 * 
 * Handles:
 *   - Inconsistent key naming (camelCase / snake_case / PascalCase)
 *   - Mixed data types (numbers as strings, strings with units/currency)
 *   - Missing fields / null values
 *   - Deeply nested optional properties (technical_specs.engine_data.core_type)
 *   - Garbage / unparseable date formats
 */

// ============================================================
//  KEY MAPPING — maps every known variant to a canonical name
// ============================================================

const KEY_MAP = {
    // Ship name
    shipname:        'name',
    ship_name:       'name',
    shipName:        'name',
    ShipName:        'name',

    // Ship class
    ship_class:      'shipClass',
    shipclass:       'shipClass',
    shipClass:       'shipClass',
    ShipClass:       'shipClass',

    // Price variants
    price:           'price',
    Price:           'price',
    cost:            'price',
    Cost:            'price',

    // Capacity variants
    capacity:        'capacity',
    Capacity:        'capacity',
    max_passengers:  'capacity',
    maxPassengers:   'capacity',
    MaxPassengers:   'capacity',

    // Manufacture date variants
    manufacturedate:     'manufactureDate',
    manufactureDate:     'manufactureDate',
    ManufactureDate:     'manufactureDate',
    manufactured_at:     'manufactureDate',
    DateOfBuild:         'manufactureDate',
    dateofbuild:         'manufactureDate',
    date_of_build:       'manufactureDate',

    // Status variants
    status:          'status',
    Status:          'status',
    ship_status:     'status',
    shipStatus:      'status',
    ShipStatus:      'status',
    condition:       'status',
    Condition:       'status',

    // Technical specs (keep as-is, handled separately)
    technical_specs:  'technicalSpecs',
    technicalSpecs:   'technicalSpecs',
    TechnicalSpecs:   'technicalSpecs',
};

// ============================================================
//  VALUE PARSERS
// ============================================================

/**
 * Extracts a numeric value from a messy price string/number.
 * Returns null if completely unparseable.
 *
 * Examples handled:
 *   1500000          → 1500000
 *   "450000"         → 450000
 *   "$75,000 credits"→ 75000
 *   "15,000,000 credits" → 15000000
 *   "100M"           → 100000000
 *   "1,200,000"      → 1200000
 *   "Priceless"      → null
 *   "Unknown"        → null
 *   "Infinite"       → null
 *   "Salvaged"       → null
 *   0                → 0
 */
function parsePrice(raw) {
    if (raw === null || raw === undefined) return null;

    // Already a finite number
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;

    if (typeof raw !== 'string') return null;

    const cleaned = raw.trim();
    if (cleaned === '') return null;

    // Handle shorthand multipliers like "100M", "2.5B", "1K"
    const multiplierMatch = cleaned.match(/^[\$£€]?\s*([\d,.]+)\s*([KMBkmb])\b/i);
    if (multiplierMatch) {
        const num = parseFloat(multiplierMatch[1].replace(/,/g, ''));
        const suffix = multiplierMatch[2].toUpperCase();
        const multipliers = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };
        return isFinite(num) ? num * (multipliers[suffix] || 1) : null;
    }

    // Strip currency symbols, commas, and trailing text (e.g., "credits", "Woolongs")
    const stripped = cleaned
        .replace(/^[\$£€]\s*/, '')    // leading currency
        .replace(/,/g, '')            // commas
        .replace(/\s*(credits|woolongs|cr|usd|eur).*$/i, ''); // trailing units

    const num = parseFloat(stripped);
    return isFinite(num) ? num : null;
}

/**
 * Extracts an integer capacity from messy data.
 * Returns null if unparseable.
 *
 * Examples handled:
 *   250            → 250
 *   "150 souls"    → 150
 *   "5000 tons"    → 5000
 *   "0 (Autonomous)" → 0
 *   "Variable"     → null
 *   "1"            → 1
 */
function parseCapacity(raw) {
    if (raw === null || raw === undefined) return null;

    if (typeof raw === 'number') return isFinite(raw) ? Math.floor(raw) : null;

    if (typeof raw !== 'string') return null;

    const cleaned = raw.trim();
    if (cleaned === '') return null;

    // Extract leading number
    const match = cleaned.match(/^([\d,]+)/);
    if (match) {
        const num = parseInt(match[1].replace(/,/g, ''), 10);
        return isFinite(num) ? num : null;
    }

    return null;
}

/**
 * Attempts to normalize a date string into a readable format.
 * Returns the original string if unparseable (e.g. "Last Tuesday").
 */
function parseDate(raw) {
    if (raw === null || raw === undefined) return 'Unknown';

    // Unix timestamp (seconds) — heuristic: a number > 1e8 and < 1e12
    if (typeof raw === 'number') {
        if (raw > 1e8 && raw < 1e12) {
            return formatDate(new Date(raw * 1000));
        }
        return String(raw);
    }

    if (typeof raw !== 'string') return 'Unknown';

    const cleaned = raw.trim();
    if (cleaned === '') return 'Unknown';

    // Known garbage values
    const garbagePatterns = [
        /^last\s/i, /^yesterday/i, /^today/i, /^tomorrow/i,
        /^next\s/i, /^three\s/i, /^just\s/i, /^\d+\s*(years?|months?|weeks?|days?)\s*ago/i,
        /^old$/i, /^ancient$/i, /^unknown$/i, /^birth$/i,
        /^long\s+ago$/i, /^\d+\s+years?\s+ago$/i,
    ];
    if (garbagePatterns.some(p => p.test(cleaned))) {
        return cleaned; // Return as-is — it's a "human" date
    }

    // Try ISO-ish: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
    const isoMatch = cleaned.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (isoMatch) {
        const d = new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]);
        if (!isNaN(d.getTime())) return formatDate(d);
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = cleaned.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (dmyMatch) {
        const d = new Date(+dmyMatch[3], +dmyMatch[2] - 1, +dmyMatch[1]);
        if (!isNaN(d.getTime())) return formatDate(d);
    }

    // MM/DD/YYYY
    const mdyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdyMatch) {
        // Already tried above, ambiguous — return as-is
        return cleaned;
    }

    return cleaned; // Return the raw string — don't hide data
}

/**
 * Formats a Date object into a human-readable string.
 */
function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return 'Unknown';
    
    const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Extracts the core_type from the deeply nested technical_specs.
 * Returns null if not found.
 *
 * Handles:
 *   { engine_data: { core_type: "plasma" } }
 *   { engineData: { coreType: "plasma" } }
 *   null / undefined / missing keys
 */
function extractCoreType(technicalSpecs) {
    if (!technicalSpecs || typeof technicalSpecs !== 'object') return null;

    // Try both naming conventions for engine_data
    const engineData = technicalSpecs.engine_data
        ?? technicalSpecs.engineData
        ?? technicalSpecs.EngineData
        ?? null;

    if (!engineData || typeof engineData !== 'object') return null;

    // Try both naming conventions for core_type
    const coreType = engineData.core_type
        ?? engineData.coreType
        ?? engineData.CoreType
        ?? null;

    if (typeof coreType !== 'string' || coreType.trim() === '') return null;

    return coreType.trim().toLowerCase();
}

// ============================================================
//  MAIN NORMALIZER
// ============================================================

/**
 * Takes a single raw ship object from the API and returns a clean,
 * consistently-typed ship object.
 *
 * @param {Object} rawShip - Raw ship object from API
 * @param {number} index   - Index in array (used for fallback ID)
 * @returns {Object}       - Normalized ship object
 */
function normalizeShip(rawShip, index) {
    if (!rawShip || typeof rawShip !== 'object') {
        return createEmptyShip(index);
    }

    // Step 1: Map all keys to canonical names
    const mapped = {};
    for (const [key, value] of Object.entries(rawShip)) {
        const lowerKey = key.toLowerCase ? key : String(key);
        // Look up by exact key first, then by lowercase
        const canonical = KEY_MAP[key] ?? KEY_MAP[lowerKey.toLowerCase()] ?? key;
        mapped[canonical] = value;
    }

    // Step 2: Extract & parse individual fields with safe defaults
    const name = safeString(mapped.name, `Unknown Ship #${index + 1}`);
    const shipClass = safeString(mapped.shipClass, 'Unclassified');
    const price = parsePrice(mapped.price);
    const capacity = parseCapacity(mapped.capacity);
    const manufactureDate = parseDate(mapped.manufactureDate);
    const status = safeString(mapped.status, 'Unknown');
    const coreType = extractCoreType(mapped.technicalSpecs);

    // Step 3: Determine if this ship triggers a critical alert
    //   Alert criteria: capacity > 100 AND core_type === "plasma"
    const isCriticalAlert = (capacity !== null && capacity > 100) && coreType === 'plasma';

    // Step 4: Calculate data quality score (how many fields had valid data)
    const fieldsPresent = [
        name !== `Unknown Ship #${index + 1}`,
        shipClass !== 'Unclassified',
        price !== null,
        capacity !== null,
        manufactureDate !== 'Unknown',
        status !== 'Unknown',
        coreType !== null,
    ].filter(Boolean).length;

    const dataQuality = fieldsPresent >= 6 ? 'clean'
        : fieldsPresent >= 4 ? 'partial'
        : 'raw';

    return {
        id: `ship-${index}`,
        name,
        shipClass,
        price,
        priceFormatted: formatPrice(price),
        capacity,
        capacityFormatted: capacity !== null ? capacity.toLocaleString() : 'N/A',
        manufactureDate,
        status,
        coreType,
        coreTypeFormatted: coreType ? capitalize(coreType) : 'Unknown',
        isCriticalAlert,
        dataQuality,
        fieldsPresent,
        rawData: rawShip, // Keep raw data for modal detail view
    };
}

/**
 * Normalizes an entire array of raw ships.
 */
function normalizeShipData(rawArray) {
    if (!Array.isArray(rawArray)) {
        console.error('[DataNormalizer] Expected array, got:', typeof rawArray);
        return [];
    }

    return rawArray
        .filter(item => item !== null && item !== undefined)
        .map((ship, index) => normalizeShip(ship, index));
}

// ============================================================
//  HELPERS
// ============================================================

function safeString(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const str = String(value).trim();
    return str.length > 0 ? str : fallback;
}

function formatPrice(price) {
    if (price === null || price === undefined) return 'N/A';
    if (price === 0) return '0 credits';
    if (price >= 1_000_000_000) return `${(price / 1_000_000_000).toFixed(1)}B credits`;
    if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)}M credits`;
    if (price >= 1_000) return `${(price / 1_000).toFixed(0)}K credits`;
    return `${price.toLocaleString()} credits`;
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function createEmptyShip(index) {
    return {
        id: `ship-${index}`,
        name: `Unknown Ship #${index + 1}`,
        shipClass: 'Unclassified',
        price: null,
        priceFormatted: 'N/A',
        capacity: null,
        capacityFormatted: 'N/A',
        manufactureDate: 'Unknown',
        status: 'Unknown',
        coreType: null,
        coreTypeFormatted: 'Unknown',
        isCriticalAlert: false,
        dataQuality: 'raw',
        fieldsPresent: 0,
        rawData: null,
    };
}

// Export for use in app.js (script tag loading order)
window.DataNormalizer = {
    normalizeShipData,
    normalizeShip,
    parsePrice,
    parseCapacity,
    parseDate,
    extractCoreType,
    formatPrice,
};
