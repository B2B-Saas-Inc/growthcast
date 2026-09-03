import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { isPublishedPost } from "../blog";

export async function GET(context) {
  const posts = (await getCollection("blog", isPublishedPost))
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
  return rss({
    title: "GrowthCast Blog",
    description: "Practical guides to growth modeling, demand, conversion, retention, revenue operations, and GTM engineering.",
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishedAt,
      link: `/blog/${post.id}/`,
      categories: post.data.tags,
      author: post.data.author,
    })),
  });
}
