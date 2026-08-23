import {
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
} from '@md/ui'
import { useState } from 'react'

import { useQuery } from '@/lib/connectrpc'
import { listAddOns } from '@/rpc/api/addons/v1/addons-AddOnsService_connectquery'
import { listBillableMetrics } from '@/rpc/api/billablemetrics/v1/billablemetrics-BillableMetricsService_connectquery'
import { listCoupons } from '@/rpc/api/coupons/v1/coupons-CouponsService_connectquery'
import { ListCouponRequest_CouponFilter } from '@/rpc/api/coupons/v1/coupons_pb'
import { listCreditNotes } from '@/rpc/api/creditnotes/v1/creditnotes-CreditNotesService_connectquery'
import { listCustomers } from '@/rpc/api/customers/v1/customers-CustomersService_connectquery'
import { listInvoices } from '@/rpc/api/invoices/v1/invoices-InvoicesService_connectquery'
import { listPlans } from '@/rpc/api/plans/v1/plans-PlansService_connectquery'
import { searchProducts } from '@/rpc/api/products/v1/products-ProductsService_connectquery'
import { listQuotes } from '@/rpc/api/quotes/v1/quotes-QuotesService_connectquery'
import { listSubscriptions } from '@/rpc/api/subscriptions/v1/subscriptions-SubscriptionsService_connectquery'

type Props = {
  entityType: string
  value?: { id: string; label: string }
  onChange: (entity: { id: string; label: string } | undefined) => void
  placeholder?: string
}

export const EntityFilterPicker = ({ entityType, value, onChange, placeholder }: Props) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  if (!SUPPORTED.has(entityType)) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-between gap-2 h-9 rounded-md border border-input bg-input px-3 text-sm"
        >
          <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
            {value ? value.label : (placeholder ?? `Any ${entityType.replace('_', ' ')}`)}
          </span>
          {value && (
            <span
              role="button"
              tabIndex={0}
              className="text-muted-foreground hover:text-foreground"
              onClick={e => {
                e.stopPropagation()
                onChange(undefined)
              }}
            >
              ×
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-2 w-72" align="start">
        <Input
          autoFocus
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mb-2"
        />
        <Results
          entityType={entityType}
          search={search}
          onPick={picked => {
            onChange(picked)
            setOpen(false)
            setSearch('')
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

const SUPPORTED = new Set([
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
])

type Picked = { id: string; label: string }

const Results = ({
  entityType,
  search,
  onPick,
}: {
  entityType: string
  search: string
  onPick: (p: Picked) => void
}) => {
  switch (entityType) {
    case 'customer':
      return <CustomerResults search={search} onPick={onPick} />
    case 'subscription':
      return <SubscriptionResults search={search} onPick={onPick} />
    case 'invoice':
      return <InvoiceResults search={search} onPick={onPick} />
    case 'quote':
      return <QuoteResults search={search} onPick={onPick} />
    case 'plan':
      return <PlanResults search={search} onPick={onPick} />
    case 'product':
      return <ProductResults search={search} onPick={onPick} />
    case 'add_on':
      return <AddOnResults search={search} onPick={onPick} />
    case 'coupon':
      return <CouponResults search={search} onPick={onPick} />
    case 'billable_metric':
      return <BillableMetricResults search={search} onPick={onPick} />
    case 'credit_note':
      return <CreditNoteResults search={search} onPick={onPick} />
    default:
      return null
  }
}

const PAGE = 20

const ItemList = ({
  isLoading,
  items,
  onPick,
}: {
  isLoading: boolean
  items: Picked[]
  onPick: (p: Picked) => void
}) => {
  if (isLoading) {
    return (
      <div className="space-y-1 py-1">
        <Skeleton height={12} width={200} />
        <Skeleton height={12} width={160} />
        <Skeleton height={12} width={180} />
      </div>
    )
  }
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground py-2 text-center">No matches</p>
  }
  return (
    <ul className="max-h-60 overflow-y-auto">
      {items.map(it => (
        <li key={it.id}>
          <button
            type="button"
            className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent"
            onClick={() => onPick(it)}
          >
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  )
}

const CustomerResults = ({ search, onPick }: { search: string; onPick: (p: Picked) => void }) => {
  const q = useQuery(listCustomers, {
    pagination: { perPage: PAGE, page: 0 },
    search: search || undefined,
  })
  const items: Picked[] = (q.data?.customers ?? []).map(c => ({ id: c.id, label: c.name }))
  return <ItemList isLoading={q.isLoading} items={items} onPick={onPick} />
}

const SubscriptionResults = ({
  search,
  onPick,
}: {
  search: string
  onPick: (p: Picked) => void
}) => {
  const q = useQuery(listSubscriptions, {
    pagination: { perPage: PAGE, page: 0 },
    search: search || undefined,
    status: [],
  })
  const items: Picked[] = (q.data?.subscriptions ?? []).map(s => ({
    id: s.id,
    label: `${s.planName ?? 'Subscription'} · ${s.customerName ?? ''}`.trim(),
  }))
  return <ItemList isLoading={q.isLoading} items={items} onPick={onPick} />
}

const InvoiceResults = ({ search, onPick }: { search: string; onPick: (p: Picked) => void }) => {
  const q = useQuery(listInvoices, {
    pagination: { perPage: PAGE, page: 0 },
    search: search || undefined,
  })
  const items: Picked[] = (q.data?.invoices ?? []).map(i => ({
    id: i.id,
    label: i.invoiceNumber,
  }))
  return <ItemList isLoading={q.isLoading} items={items} onPick={onPick} />
}

const QuoteResults = ({ search, onPick }: { search: string; onPick: (p: Picked) => void }) => {
  const q = useQuery(listQuotes, {
    pagination: { perPage: PAGE, page: 0 },
    search: search || undefined,
  })
  const items: Picked[] = (q.data?.quotes ?? []).map(quote => ({
    id: quote.id,
    label: quote.quoteNumber,
  }))
  return <ItemList isLoading={q.isLoading} items={items} onPick={onPick} />
}

const PlanResults = ({ search, onPick }: { search: string; onPick: (p: Picked) => void }) => {
  const q = useQuery(listPlans, {
    pagination: { perPage: PAGE, page: 0 },
  })
  // listPlans has no server-side search.
  const items: Picked[] = (q.data?.plans ?? [])
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .map(p => ({ id: p.id, label: p.name }))
  return <ItemList isLoading={q.isLoading} items={items} onPick={onPick} />
}

const ProductResults = ({ search, onPick }: { search: string; onPick: (p: Picked) => void }) => {
  const q = useQuery(searchProducts, {
    pagination: { perPage: PAGE, page: 0 },
    query: search || undefined,
  })
  const items: Picked[] = (q.data?.products ?? []).map(p => ({ id: p.id, label: p.name }))
  return <ItemList isLoading={q.isLoading} items={items} onPick={onPick} />
}

const AddOnResults = ({ search, onPick }: { search: string; onPick: (p: Picked) => void }) => {
  const q = useQuery(listAddOns, {
    pagination: { perPage: PAGE, page: 0 },
    search: search || undefined,
  })
  const items: Picked[] = (q.data?.addOns ?? []).map(a => ({ id: a.id, label: a.name }))
  return <ItemList isLoading={q.isLoading} items={items} onPick={onPick} />
}

const CouponResults = ({ search, onPick }: { search: string; onPick: (p: Picked) => void }) => {
  const q = useQuery(listCoupons, {
    pagination: { perPage: PAGE, page: 0 },
    search: search || undefined,
    // Activity can reference archived coupons, so don't narrow to active ones.
    filter: ListCouponRequest_CouponFilter.ALL,
  })
  const items: Picked[] = (q.data?.coupons ?? []).map(c => ({ id: c.id, label: c.code }))
  return <ItemList isLoading={q.isLoading} items={items} onPick={onPick} />
}

const BillableMetricResults = ({
  search,
  onPick,
}: {
  search: string
  onPick: (p: Picked) => void
}) => {
  const q = useQuery(listBillableMetrics, {
    pagination: { perPage: PAGE, page: 0 },
    search: search || undefined,
  })
  const items: Picked[] = (q.data?.billableMetrics ?? []).map(m => ({ id: m.id, label: m.name }))
  return <ItemList isLoading={q.isLoading} items={items} onPick={onPick} />
}

const CreditNoteResults = ({ search, onPick }: { search: string; onPick: (p: Picked) => void }) => {
  const q = useQuery(listCreditNotes, {
    pagination: { perPage: PAGE, page: 0 },
    search: search || undefined,
  })
  const items: Picked[] = (q.data?.creditNotes ?? []).map(cn => ({
    id: cn.id,
    label: cn.creditNoteNumber,
  }))
  return <ItemList isLoading={q.isLoading} items={items} onPick={onPick} />
}
