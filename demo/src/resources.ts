import { createDocumentResource, createQueryResource, embed, list } from 'retil'

interface User {
  id: number
  name: string
  username: string
  email: string
}

interface Post {
  userId: number
  id: number
  title: string
  body: string
}

const BaseURL = `https://jsonplaceholder.typicode.com`

export const user = createDocumentResource<User>('user')
export const post = createDocumentResource<Post>('post')

export const userWithPosts = createQueryResource('userAndPosts', {
  // Note that if you have multiple query resources w/ the same embeds, they
  // will get out of sync. If you need them to stay in sync, you'll need to
  // create separate query resources for the embed queries.
  for: embed(user, {
    posts: (userId: string) => postList(userId),
  }),
  load: (userId: string) => BaseURL + `/users/${userId}?_embed=posts`,
})

export const userList = createQueryResource('userList', {
  for: list(user),
  load: () => BaseURL + `/users`,
})

export const postWithUser = createQueryResource('postWithUser', {
  for: embed(post, {
    user: () => user(),
  }),
  load: (postId: string) => BaseURL + `/posts/${postId}?_expand=user`,
})

export const postList = createQueryResource('postList', {
  for: list(post),
  load: (userId: string) => BaseURL + `/user/${userId}/posts`,
})
