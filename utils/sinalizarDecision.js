export function decideSinalizar({ hasGroup, inSameZone }) {
  if (!hasGroup) { return "PUBLIC"; }
  if (hasGroup && inSameZone) { return "PRIVATE_OR_PUBLIC"; }
  return "PUBLIC";
}
