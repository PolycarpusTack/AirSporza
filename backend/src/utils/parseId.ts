export const parseId = (param: string | string[] | undefined): number => {
  if (!param || Array.isArray(param)) return 0
  return parseInt(param, 10)
}
