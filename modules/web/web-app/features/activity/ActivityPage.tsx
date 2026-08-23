import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@md/ui'
import { useMemo, useState } from 'react'

import { DatePickerWithRange } from '@/features/dashboard/DateRangePicker'
import { ActorType } from '@/rpc/api/activity/v1/activity_pb'

import { ActorFilterPicker } from './ActorFilterPicker'
import { EntityFilterPicker } from './EntityFilterPicker'
import { OrgActivityList, type OrgActivityFilters } from './OrgActivityList'
import { KNOWN_ACTIVITY_TYPES } from './types'

import type { FunctionComponent } from 'react'
import type { DateRange } from 'react-day-picker'

type Picked = { id: string; label: string }

/** Sentinel for "no filter" — Radix Select cannot hold an empty-string value. */
const ANY = 'any'

/**
 * Actor types that can be narrowed to a specific actor. `ActorFilterPicker`
 * renders nothing for SYSTEM / QUOTE_RECIPIENT (there is no list RPC to pick
 * from), so those are filterable by type alone.
 */
const ACTOR_TYPE_OPTIONS: { value: ActorType; label: string }[] = [
  { value: ActorType.USER, label: 'User' },
  { value: ActorType.API_TOKEN, label: 'API token' },
  { value: ActorType.CUSTOMER, label: 'Customer' },
  { value: ActorType.SYSTEM, label: 'System' },
  { value: ActorType.QUOTE_RECIPIENT, label: 'Quote recipient' },
]

/**
 * Entity types `EntityFilterPicker` can resolve to a specific entity. Kept in
 * step with its `SUPPORTED` set — a type listed here but not there silently
 * renders no picker, leaving the filter stuck on "any of this kind".
 *
 * `api_token` and `connector` are deliberately absent: `ActivityEntryRow`
 * renders those from activity metadata rather than an entity reference, so
 * there is nothing to resolve them against.
 */
const ENTITY_TYPE_OPTIONS = [
  'customer',
  'subscription',
  'invoice',
  'quote',
  'plan',
  'product',
  'add_on',
  'coupon',
  'billable_metric',
  'credit_note',
]

const startOfDay = (d: Date): Date => {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/** Inclusive upper bound — the picker gives a date, the API wants an instant. */
const endOfDay = (d: Date): Date => {
  const out = new Date(d)
  out.setHours(23, 59, 59, 999)
  return out
}

/**
 * Organization-wide audit log: every recorded system and user action across the
 * tenant, filterable by actor, entity, activity type and date.
 *
 * Backed by `ListActivity`, which already implements every filter this page
 * exposes — see `modules/meteroid/src/api/activity/service.rs`.
 */
export const ActivityPage: FunctionComponent = () => {
  const [activityType, setActivityType] = useState<string>(ANY)
  const [actorType, setActorType] = useState<string>(ANY)
  const [actor, setActor] = useState<Picked | undefined>()
  const [entityType, setEntityType] = useState<string>(ANY)
  const [entity, setEntity] = useState<Picked | undefined>()
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 30)
    return { from, to }
  })

  const selectedActorType = actorType === ANY ? undefined : (Number(actorType) as ActorType)

  const filters = useMemo<OrgActivityFilters>(() => {
    // entity_type and entity_id must travel together or the server returns
    // invalid_argument. Filtering by type alone is expressed through the
    // repeated `entityTypes` field instead.
    const hasEntityType = entityType !== ANY
    return {
      activityTypes: activityType === ANY ? undefined : [activityType],
      actorType: selectedActorType,
      // An actor id is only meaningful alongside its type; the server rejects
      // actor_id without actor_type.
      actorId: selectedActorType !== undefined ? actor?.id : undefined,
      entityType: hasEntityType && entity ? entityType : undefined,
      entityId: hasEntityType && entity ? entity.id : undefined,
      entityTypes: hasEntityType && !entity ? [entityType] : undefined,
      occurredAfter: dateRange?.from ? startOfDay(dateRange.from).toISOString() : undefined,
      occurredBefore: dateRange?.to ? endOfDay(dateRange.to).toISOString() : undefined,
    }
  }, [activityType, selectedActorType, actor, entityType, entity, dateRange])

  const isFiltered =
    activityType !== ANY || actorType !== ANY || entityType !== ANY || dateRange !== undefined

  const reset = () => {
    setActivityType(ANY)
    setActorType(ANY)
    setActor(undefined)
    setEntityType(ANY)
    setEntity(undefined)
    setDateRange(undefined)
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg pb-2 font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every system and user action recorded across this tenant.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={activityType} onValueChange={setActivityType}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Filter by activity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All activity</SelectItem>
            {KNOWN_ACTIVITY_TYPES.map(t => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={actorType}
          onValueChange={v => {
            setActorType(v)
            // The picked actor belongs to the previous type; keeping it would
            // send a mismatched actor_id.
            setActor(undefined)
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Filter by actor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any actor</SelectItem>
            {ACTOR_TYPE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedActorType !== undefined && (
          <ActorFilterPicker actorType={selectedActorType} value={actor} onChange={setActor} />
        )}

        <Select
          value={entityType}
          onValueChange={v => {
            setEntityType(v)
            setEntity(undefined)
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Filter by entity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any entity</SelectItem>
            {ENTITY_TYPE_OPTIONS.map(t => (
              <SelectItem key={t} value={t}>
                {t.replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {entityType !== ANY && (
          <EntityFilterPicker entityType={entityType} value={entity} onChange={setEntity} />
        )}

        <DatePickerWithRange range={dateRange} setRange={setDateRange} />

        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear
          </Button>
        )}
      </div>

      <OrgActivityList filters={filters} />
    </div>
  )
}
