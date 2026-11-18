import { Tag } from './Tag'

/** Marks a task in its first 24 hours (isNew). Violet means new and nothing else. */
export function NewTag() {
  return <Tag className="bg-violet-200 text-violet-800">New</Tag>
}
