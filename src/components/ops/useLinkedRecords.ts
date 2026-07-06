/**
 * useLinkedRecords (C-3-T1) — the LAZY per-selection linked-record fetch hook.
 * On each selection change it fetches ONLY the endpoints for that record's kind
 * (see linkedRecordListPlan), assembles a `LinkedRecordPayloads`, and derives the
 * hop sections via `linkedRecordsOf` (pure — registry-selectors v1.1). NO
 * derivation lives in the component (anti-smart-ui); this hook isolates the fetch.
 *
 * Idiom: useRegistryData / useContracts — QUIET failure (a rejected fetch → empty
 * payload → empty sections; no toast), and a PER-RUN `active` guard (mirrors
 * useContracts pin 3) so a slow fetch from a PREVIOUS selection — hops switch
 * selection rapidly — never overwrites the current one (its effect's cleanup set
 * its own `active` false). The fetched payloads are also keyed by the selection
 * id, so a render during the fetch window shows the NEW record with empty links,
 * never the prior selection's rows. No Date.now()/Math.random().
 *
 *   sport       → NO fetch (linkedRecordsOf reads the index adjacency)
 *   competition → teamsApi.list({ competitionId })                → { teams }
 *   team        → teamsApi.listCompetitions + playersApi.list({ teamId }) (parallel)
 *                                                                  → { teamCompetitions, players }
 *   player      → playersApi.listTeams                            → { playerTeams }
 */
import { useEffect, useState } from 'react'
import { playersApi, teamsApi } from '../../services'
import {
  linkedRecordsOf,
  type LinkedRecordPayloads,
  type LinkedRecordSection,
  type RegistryIndex,
  type RegistryRecord,
} from './registrySelectors'

export interface UseLinkedRecordsReturn {
  sections: LinkedRecordSection[]
}

/** Fetched payloads tagged with the selection they belong to (anti-flash / stale guard). */
interface FetchedForSelection {
  recordId: string
  payloads: LinkedRecordPayloads
}

export function useLinkedRecords(record: RegistryRecord | null, index: RegistryIndex): UseLinkedRecordsReturn {
  const [fetched, setFetched] = useState<FetchedForSelection | null>(null)

  useEffect(() => {
    let active = true

    // sport needs no fetch; null needs nothing. (Cleanup still guards a race.)
    if (record !== null && record.kind !== 'sport') {
      const id = record.id
      const store = (payloads: LinkedRecordPayloads) => {
        if (active) setFetched({ recordId: id, payloads })
      }

      if (record.kind === 'competition') {
        teamsApi
          .list({ competitionId: record.dbId })
          .then((teams) => store({ teams }))
          .catch(() => {
            /* quiet — empty payload → empty sections */
          })
      } else if (record.kind === 'team') {
        // parallel; each arm quiet-fails to [] independently.
        Promise.allSettled([
          teamsApi.listCompetitions(record.dbId),
          playersApi.list({ teamId: record.dbId }),
        ]).then(([competitions, roster]) => {
          store({
            teamCompetitions: competitions.status === 'fulfilled' ? competitions.value : [],
            players: roster.status === 'fulfilled' ? roster.value : [],
          })
        })
      } else {
        playersApi
          .listTeams(record.dbId)
          .then((playerTeams) => store({ playerTeams }))
          .catch(() => {
            /* quiet */
          })
      }
    }

    return () => {
      active = false
    }
  }, [record])

  // Only apply payloads that belong to the CURRENT selection (stale/anti-flash).
  const payloads = record && fetched?.recordId === record.id ? fetched.payloads : {}
  const sections = record ? linkedRecordsOf(index, record.id, payloads) : []
  return { sections }
}
