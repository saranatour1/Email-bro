import { authApi } from '../models/users/auth'
import { removeApi } from '../models/users/remove'

export const { me } = authApi
export const { deleteAccount } = removeApi
