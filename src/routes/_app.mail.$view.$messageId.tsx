import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../convex/_generated/dataModel'
import { Reader } from '~/components/reader'

const MessagePanel = () => {
  const { view, messageId } = Route.useParams()
  const navigate = Route.useNavigate()
  return (
    <Reader
      key={messageId}
      id={messageId}
      wide={view !== 'board'}
      onClose={() => void navigate({ to: '/mail/$view', params: { view }, search: true })}
    />
  )
}

export const Route = createFileRoute('/_app/mail/$view/$messageId')({
  // Convex validates the id on the server; this only types the param.
  params: {
    parse: ({ messageId }) => ({ messageId: messageId as Id<'messages'> }),
    stringify: ({ messageId }) => ({ messageId }),
  },
  component: MessagePanel,
})
