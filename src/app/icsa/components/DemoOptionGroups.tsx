import type { DemoOption } from '@/lib/icsa/demo';

/** The demo people as <option>s under Admins / Champions / Employees headings, in that order. */
export default function DemoOptionGroups({ options }: { options: DemoOption[] }) {
  const groups: { name: string; items: DemoOption[] }[] = [];
  for (const o of options) {
    const last = groups.at(-1);
    if (last?.name === o.group) last.items.push(o);
    else groups.push({ name: o.group, items: [o] });
  }
  return groups.map((g) => (
    <optgroup key={g.name} label={g.name}>
      {g.items.map((o) => (
        <option key={o.username} value={o.username}>
          {o.label}
        </option>
      ))}
    </optgroup>
  ));
}
