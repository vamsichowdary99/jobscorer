// India location autocomplete list. Shared by search and settings pages
// so adding a city in one place picks it up everywhere.
// Order: broad → states → UTs → regions → tier-1 metros → NCR → tier-2 cities → tier-3.
// Both common spellings of each city are kept (Bengaluru/Bangalore, Mumbai/Bombay,
// Hubli/Hubballi, etc.) so the autocomplete catches whatever the user types.

export const INDIA_LOCATIONS: string[] = [
    // Broadest options
    'India', 'Pan India', 'Anywhere in India',
    'Remote', 'Work From Home', 'Hybrid',

    // States (28)
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',

    // Union Territories
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
    'Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
    'Lakshadweep', 'Puducherry',

    // Regions / clusters
    'Delhi NCR', 'NCR', 'Tri-City', 'Northeast India',
    'South India', 'North India', 'West India', 'East India',

    // Tier-1 metros
    'Bengaluru', 'Bangalore', 'Mumbai', 'Bombay', 'New Delhi',
    'Hyderabad', 'Secunderabad', 'Chennai', 'Madras',
    'Pune', 'Poona', 'Kolkata', 'Calcutta', 'Ahmedabad',

    // NCR cluster
    'Noida', 'Greater Noida', 'Gurugram', 'Gurgaon',
    'Faridabad', 'Ghaziabad',

    // Tier-2 cities — sorted roughly by population
    'Jaipur', 'Coimbatore', 'Nagpur', 'Indore', 'Bhopal', 'Lucknow',
    'Kochi', 'Cochin', 'Thiruvananthapuram', 'Trivandrum',
    'Visakhapatnam', 'Vizag', 'Vijayawada', 'Vadodara', 'Baroda', 'Surat',
    'Mysuru', 'Mysore', 'Nashik', 'Patna', 'Bhubaneswar', 'Cuttack',
    'Dehradun', 'Mohali', 'Panchkula', 'Navi Mumbai', 'Thane',
    'Mangalore', 'Mangaluru', 'Hubli', 'Hubballi',
    'Tiruchirappalli', 'Trichy', 'Madurai', 'Salem', 'Vellore',
    'Warangal', 'Rajkot', 'Jodhpur', 'Udaipur',
    'Agra', 'Varanasi', 'Kanpur', 'Allahabad', 'Prayagraj', 'Meerut',
    'Aurangabad', 'Sambhajinagar', 'Solapur', 'Kolhapur',
    'Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro',
    'Raipur', 'Bilaspur', 'Korba',
    'Guwahati', 'Shimla', 'Manali', 'Mussoorie',
    'Jammu', 'Srinagar',
    'Amritsar', 'Ludhiana', 'Jalandhar', 'Patiala',

    // Andhra Pradesh / Telangana
    'Guntur', 'Nellore', 'Tirupati', 'Kakinada', 'Rajahmundry',
    'Karimnagar', 'Nizamabad', 'Khammam',

    // Tamil Nadu
    'Tiruppur', 'Erode', 'Hosur', 'Tirunelveli', 'Thoothukudi', 'Tuticorin',
    'Pondicherry', 'Puducherry', 'Cuddalore',

    // Karnataka
    'Belagavi', 'Belgaum', 'Davanagere', 'Tumakuru', 'Tumkur',
    'Shivamogga', 'Shimoga', 'Hassan', 'Udupi',

    // Maharashtra
    'Amravati', 'Sangli', 'Akola', 'Latur', 'Nanded', 'Jalgaon',

    // Uttar Pradesh
    'Aligarh', 'Bareilly', 'Moradabad', 'Saharanpur', 'Gorakhpur',
    'Jhansi', 'Mathura', 'Ayodhya',

    // Madhya Pradesh
    'Gwalior', 'Jabalpur', 'Ujjain', 'Sagar', 'Satna',

    // West Bengal
    'Howrah', 'Siliguri', 'Asansol', 'Durgapur', 'Darjeeling',

    // Kerala
    'Kozhikode', 'Calicut', 'Thrissur', 'Palakkad', 'Kollam',
    'Quilon', 'Alappuzha', 'Kannur', 'Kottayam',

    // Northeast India
    'Imphal', 'Aizawl', 'Itanagar', 'Kohima', 'Shillong',
    'Agartala', 'Gangtok', 'Dimapur',

    // Goa / coastal
    'Panaji', 'Margao', 'Vasco da Gama',

    // Gujarat extras
    'Bhavnagar', 'Jamnagar', 'Junagadh', 'Anand', 'Gandhinagar',

    // Rajasthan extras
    'Kota', 'Bikaner', 'Ajmer',

    // Misc
    'Port Blair', 'Daman', 'Diu', 'Silvassa',
]

// ───────────────────────────────────────────────────────────────────────────
// Metro-level location facet for the AI Matches page.
//
// Seeded from the Supabase `location_aliases` table — the SAME canonical
// groupings the ingestion workflow uses — so a job tagged "Secunderabad" or
// "Greater Hyderabad Area" still folds under Hyderabad, and the many spellings
// of Bengaluru/Bangalore collapse to one bucket. Kept here as a small frontend
// facet (rather than a runtime table fetch) because the metro set is stable and
// the match list is only tens of rows; regenerate from `location_aliases` if the
// canonical metros change.
//
// Metro grouping is intentional: each bucket folds in its satellite cities
// (Hyderabad ⊇ Secunderabad; Delhi NCR ⊇ Gurgaon/Noida/…) so a user filtering
// "Hyderabad" sees the whole metro, not just the literal city string.

export interface LocationBucket {
    key: string
    label: string
    /** lowercase tokens; a job.location matching any (word-boundary) belongs here */
    tokens: string[]
}

// Order here is the display order of the chips.
export const METRO_BUCKETS: LocationBucket[] = [
    { key: 'bangalore', label: 'Bangalore', tokens: ['bangalore', 'bengaluru'] },
    { key: 'hyderabad', label: 'Hyderabad', tokens: ['hyderabad', 'secunderabad'] },
    { key: 'mumbai', label: 'Mumbai', tokens: ['mumbai', 'bombay', 'navi mumbai', 'thane'] },
    { key: 'pune', label: 'Pune', tokens: ['pune', 'poona'] },
    { key: 'chennai', label: 'Chennai', tokens: ['chennai', 'madras'] },
    { key: 'delhi', label: 'Delhi NCR', tokens: ['delhi', 'new delhi', 'ncr', 'gurgaon', 'gurugram', 'noida', 'greater noida', 'faridabad', 'ghaziabad'] },
    { key: 'kolkata', label: 'Kolkata', tokens: ['kolkata', 'calcutta'] },
    { key: 'ahmedabad', label: 'Ahmedabad', tokens: ['ahmedabad'] },
    { key: 'chandigarh', label: 'Chandigarh', tokens: ['chandigarh', 'mohali', 'panchkula'] },
]

const REMOTE_TOKENS = ['remote', 'work from home', 'work-from-home', 'wfh', 'anywhere']

export const ALL_LOCATION_KEY = 'all'
export const REMOTE_KEY = 'remote'
export const OTHER_KEY = 'other'

// Word-boundary match so "madras" can't hit inside another word and multi-word
// tokens ("new delhi") match as a phrase. We use a manual boundary class rather
// than \b because city strings contain commas/parens, not just \w boundaries.
function hasToken(haystack: string, token: string): boolean {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(haystack)
}

/**
 * Map a raw `jobs.location` string to the set of metro bucket keys it belongs
 * to. Multi-city listings ("Mumbai, Bengaluru") return multiple keys so the job
 * shows under each filter. Returns [REMOTE_KEY] (plus any named cities) for
 * remote/WFH, and [OTHER_KEY] when nothing matches (null, "Not specified", an
 * unlisted city).
 */
export function bucketsForLocation(raw: string | null | undefined): string[] {
    const s = (raw ?? '').toLowerCase().trim()
    if (!s) return [OTHER_KEY]

    const cities = METRO_BUCKETS.filter(b => b.tokens.some(t => hasToken(s, t))).map(b => b.key)

    if (REMOTE_TOKENS.some(t => hasToken(s, t))) {
        // "Remote, Bangalore" should appear under both Remote and Bangalore.
        return cities.length ? [REMOTE_KEY, ...cities] : [REMOTE_KEY]
    }
    return cities.length ? cities : [OTHER_KEY]
}

const METRO_LABELS: Record<string, string> = {
    ...Object.fromEntries(METRO_BUCKETS.map(b => [b.key, b.label])),
    [REMOTE_KEY]: 'Remote',
    [OTHER_KEY]: 'Other',
}

export function locationLabel(key: string): string {
    return METRO_LABELS[key] ?? key
}

type LocatableMatch = { job?: { location?: string | null } | null }

/**
 * Produce ordered location facet buckets with counts, in METRO order then
 * Remote then Other. Only returns buckets that actually have ≥1 match. A
 * multi-city job increments every bucket it belongs to, so counts can sum to
 * more than the match total — that's expected for an OR facet.
 */
export function locationFacets(
    matchesList: LocatableMatch[],
): { key: string; label: string; count: number }[] {
    const counts = new Map<string, number>()
    for (const m of matchesList) {
        for (const k of bucketsForLocation(m.job?.location)) {
            counts.set(k, (counts.get(k) ?? 0) + 1)
        }
    }
    const order = [...METRO_BUCKETS.map(b => b.key), REMOTE_KEY, OTHER_KEY]
    return order
        .filter(k => (counts.get(k) ?? 0) > 0)
        .map(k => ({ key: k, label: locationLabel(k), count: counts.get(k)! }))
}

/** True if the match belongs to the given location bucket (or the bucket is 'all'). */
export function matchInLocation(match: LocatableMatch, locationKey: string): boolean {
    if (locationKey === ALL_LOCATION_KEY) return true
    return bucketsForLocation(match.job?.location).includes(locationKey)
}
