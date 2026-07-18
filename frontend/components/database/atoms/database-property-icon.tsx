import type { DatabasePropertyType } from "@reason/core/database"
import {
  CalendarDaysIcon,
  CaseSensitiveIcon,
  CheckSquareIcon,
  CircleDotDashedIcon,
  HashIcon,
  TagsIcon,
  TextIcon,
  type LucideIcon,
} from "lucide-react"

const PROPERTY_ICONS: Record<DatabasePropertyType, LucideIcon> = {
  title: TextIcon,
  text: CaseSensitiveIcon,
  number: HashIcon,
  checkbox: CheckSquareIcon,
  status: CircleDotDashedIcon,
  tags: TagsIcon,
  date: CalendarDaysIcon,
}

export function DatabasePropertyIcon({
  type,
  className,
}: {
  type: DatabasePropertyType
  className?: string
}) {
  const Icon = PROPERTY_ICONS[type]
  return <Icon aria-hidden="true" className={className} />
}
