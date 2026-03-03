// Maps Belgian/Dutch CSV column headers to Planza event fields.

/** Maps Dutch/Belgian spreadsheet column names → internal Event field names */
export const COLUMN_MAP: Record<string, string> = {
  'Datum BE':           'startDateBE',
  'Starttijd BE':       'startTimeBE',
  'Datum Origin':       'startDateOrigin',
  'Starttijd Origin':   'startTimeOrigin',
  'Deelnemers':         'participants',
  'Inhoud':             'content',
  'Fase':               'phase',
  'Categorie':          'category',
  'Kanaal':             'linearChannel',
  'Radio':              'radioChannel',
  'Lineaire starttijd': 'linearStartTime',
  'Livestream datum':   'livestreamDate',
  'Livestream tijd':    'livestreamTime',
  'Complex':            'complex',
  'Live':               'isLive',
  'Uitgesteld live':    'isDelayedLive',
  'Videoref':           'videoRef',
  'Winnaar':            'winner',
  'Score':              'score',
  'Duur':               'duration',
}

export type ParsedRow = Record<string, string | boolean | null>

/**
 * Maps one raw CSV row (Dutch column headers) to internal field names.
 * Returns null if required fields are missing.
 */
export function parseCsvRow(raw: Record<string, string>): ParsedRow | null {
  const result: ParsedRow = {}

  for (const [csvCol, fieldName] of Object.entries(COLUMN_MAP)) {
    const rawVal = raw[csvCol]
    if (rawVal === undefined || rawVal === '') continue

    if (fieldName === 'isLive' || fieldName === 'isDelayedLive') {
      result[fieldName] = rawVal.toLowerCase() === 'ja' || rawVal === '1' || rawVal.toLowerCase() === 'true'
    } else {
      result[fieldName] = rawVal.trim()
    }
  }

  // Validate required fields
  if (!result['participants']) return null

  return result
}
