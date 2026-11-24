import { listApi } from '../models/mailboxes/list'
import { domainApi } from '../models/mailboxes/domain'
import { connectApi } from '../models/mailboxes/gmail/connect'
import { syncApi } from '../models/mailboxes/gmail/sync'
import { optionsApi } from '../models/mailboxes/options'
import { manageApi as cloudflareApi } from '../models/cloudflareAccounts/manage'

export const { list } = listApi
export const { addDomainMailbox, addCloudflareMailbox } = domainApi
export const { startGmailConnect } = connectApi
export const { syncNow } = syncApi
export const { setGmailOptions } = optionsApi
// The user's own Cloudflare account for their domain.
export const { connect: connectCloudflare, status: cloudflareStatus, disconnect: disconnectCloudflare } = cloudflareApi
