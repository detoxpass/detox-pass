export function compensationResult(sqlSaved: boolean, reverted: boolean | null) {
  if (sqlSaved) return 'ok'
  if (reverted) return 'reverted'
  return 'compensation_required'
}
