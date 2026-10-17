import { manageApi } from '../models/jevWorkflows/manage'
import { suggestApi } from '../models/jevWorkflows/suggest'

export const { list, create, setEnabled, remove } = manageApi
export const { suggest } = suggestApi
