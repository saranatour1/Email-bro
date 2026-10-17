import { listApi } from '../models/mailboxes/list'
import { domainApi } from '../models/mailboxes/domain'
import { connectApi } from '../models/mailboxes/gmail/connect'
import { syncApi } from '../models/mailboxes/gmail/sync'

export const { list } = listApi
export const { addDomainMailbox } = domainApi
export const { startGmailConnect } = connectApi
export const { syncNow } = syncApi
