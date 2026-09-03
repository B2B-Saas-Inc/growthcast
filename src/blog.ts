export const isPublishedPost = ({ data }: { data: { draft?: boolean; publishedAt: Date } }) =>
  !data.draft && data.publishedAt.valueOf() <= Date.now();
