import { listApi } from '../models/messages/list'
import { statusApi } from '../models/messages/status'
import { sendApi } from '../models/messages/send'
import { readApi } from '../models/messages/read'

export const { list, get } = listApi
export const { markRead, setStatus, snooze } = statusApi
export const { reply } = sendApi
export const { read } = readApi
