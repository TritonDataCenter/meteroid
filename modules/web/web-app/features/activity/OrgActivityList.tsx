import { Button, Skeleton } from '@md/ui'
import { useState } from 'react'

import { useQuery } from '@/lib/connectrpc'
import { listActivity } from '@/rpc/api/activity/v1/activity-ActivityService_connectquery'
import { ActivityEntry } from '@/rpc/api/activity/v1/activity_pb'

import { ActivityEntryRow } from './ActivityEntryRow'

import type { ActorType } from '@/rpc/api/activity/v1/activity_pb'

/**
 * Filters mirroring the subset of `ListActivityRequest` the page exposes.
 * `entityType`/`entityId` are sent together or not at all — the server rejects
 * one without the other.
 */
export type OrgActivityFilters = {
  activityTypes?: string[]
  actorType?: ActorType
  actorId?: string
  /** Narrow to one specific entity. Must be paired with `entityId`. */
  entityType?: string
  entityId?: string
  /** Narrow to a kind of entity without picking one. Independent of the pair above. */
  entityTypes?: string[]
  /** RFC 3339; the backend parses with `DateTime::parse_from_rfc3339`. */
  occurredAfter?: string
  occurredBefore?: string
}

type Props = {
  filters: OrgActivityFilters
  /** Page size for the initial fetch and each "Load more" click. */
  limit?: number
  emptyLabel?: string
}

type LoadedPage = {
  entries: ActivityEntry[]
  cursor?: string
}

/**
 * Serialises the filter set so a change to any field can reset pagination.
 * Key order is fixed by construction here, so equal filters always produce an
 * equal string.
 */
const filterKey = (f: OrgActivityFilters): string =>
  JSON.stringify([
    f.activityTypes ?? [],
    f.actorType ?? null,
    f.actorId ?? null,
    f.entityType ?? null,
    f.entityId ?? null,
    f.entityTypes ?? [],
    f.occurredAfter ?? null,
    f.occurredBefore ?? null,
  ])

/**
 * Org-wide activity feed, backed by `ListActivity`.
 *
 * Cursor accumulation follows `EntityActivityTimeline`, with one necessary
 * difference: that component is mounted per entity and relies on the parent
 * remounting it via `key` when the entity changes, so it never resets its own
 * page stack. This list stays mounted while several independent filters change
 * underneath it, so it must drop accumulated pages itself — otherwise the next
 * result set renders *underneath* rows that no longer match the filter.
 */
export const OrgActivityList = ({
  filters,
  limit = 25,
  emptyLabel = 'No activity matches these filters',
}: Props) => {
  const [pages, setPages] = useState<LoadedPage[]>([])

  // Reset during render, not in an effect. An effect fires after paint, which
  // leaves two observable defects: one frame showing rows from the previous
  // filter, and — worse — the first request under the new filter carrying
  // `nextCursor` from the old one, resuming the new result set from a position
  // that means nothing in it. Adjusting state during render makes React
  // discard this pass and re-render before committing, so neither happens.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const key = filterKey(filters)
  const [prevKey, setPrevKey] = useState(key)
  if (prevKey !== key) {
    setPrevKey(key)
    setPages([])
  }

  // Read after the reset above so a filter change starts from no cursor.
  const nextCursor = prevKey === key ? pages.at(-1)?.cursor : undefined

  const query = useQuery(
    listActivity,
    {
      activityTypes: filters.activityTypes,
      entityTypes: filters.entityTypes,
      actorType: filters.actorType,
      actorId: filters.actorId,
      entityType: filters.entityType,
      entityId: filters.entityId,
      occurredAfter: filters.occurredAfter,
      occurredBefore: filters.occurredBefore,
      limit,
      cursor: nextCursor,
    },
    { staleTime: 30_000 }
  )

  const liveEntries = query.data?.entries ?? []
  const liveCursor = query.data?.nextCursor
  const allEntries = [...pages.flatMap(p => p.entries), ...liveEntries]

  if (query.isLoading && pages.length === 0) {
    return (
      <div className="space-y-3 py-3">
        <Skeleton height={16} width={320} />
        <Skeleton height={16} width={280} />
        <Skeleton height={16} width={300} />
        <Skeleton height={16} width={260} />
      </div>
    )
  }

  // Distinguish "the query failed" from "there is nothing here". Rendering the
  // empty state on error would claim, wrongly and unfalsifiably, that no audit
  // activity matched — the one thing an audit log must never do. A failure on a
  // later page is worse still: the feed would appear complete while silently
  // truncated, with the "Load more" affordance gone.
  if (query.isError) {
    return (
      <div className="space-y-4">
        {allEntries.length > 0 && (
          <ul className="divide-y">
            {allEntries.map(entry => (
              <ActivityEntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
        <div className="rounded-md border border-dashed border-destructive/50 py-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {allEntries.length > 0
              ? 'Could not load more activity — this list may be incomplete.'
              : 'Could not load activity.'}
          </p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (allEntries.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div>
      <ul className="divide-y">
        {allEntries.map(entry => (
          <ActivityEntryRow key={entry.id} entry={entry} />
        ))}
      </ul>
      {liveCursor && (
        <div className="pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => setPages(p => [...p, { entries: liveEntries, cursor: liveCursor }])}
          >
            {query.isFetching ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}
