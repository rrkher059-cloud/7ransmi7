import { describe, expect, it } from 'vitest'
import { filterProfileTweets } from './profileFilters.ts'
import type { Tweet } from '../../shared/schemas.ts'

const USER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

function tweet(partial: Partial<Tweet> & Pick<Tweet, 'id' | 'body' | 'userId'>): Tweet {
  return {
    handle: partial.userId === USER ? '@ops' : '@other',
    createdAt: '2026-07-21T12:00:00.000Z',
    likes: 0,
    liked: false,
    likedBy: [],
    reactions: [],
    comments: [],
    repostCount: 0,
    reposted: false,
    imageUrl: null,
    replyToId: null,
    repostOfId: null,
    repostOfHandle: null,
    ...partial,
  }
}

describe('filterProfileTweets', () => {
  const catalog: Tweet[] = [
    tweet({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', body: 'Mission log clear', userId: USER }),
    tweet({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      body: '@tokyo_node copy that relay',
      userId: USER,
    }),
    tweet({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      body: 'Highlighted burst',
      userId: USER,
      likes: 3,
      reactions: [{ emoji: '🔥', userId: OTHER }],
    }),
    tweet({
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      body: 'Someone else posted',
      userId: OTHER,
      likedBy: [USER],
      liked: true,
    }),
    tweet({
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      body: 'Shared from orbit',
      userId: USER,
      repostOfId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      repostOfHandle: '@other',
    }),
    tweet({
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      body: 'Threaded reply',
      userId: USER,
      replyToId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    }),
  ]

  it('posts includes originals only', () => {
    const result = filterProfileTweets(catalog, USER, 'posts')
    expect(result.map((t) => t.id)).toEqual([
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
    ])
  })

  it('reposts includes only repost entries', () => {
    const result = filterProfileTweets(catalog, USER, 'reposts')
    expect(result.map((t) => t.id)).toEqual([
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    ])
  })

  it('replies includes @-prefixed and replyToId posts', () => {
    const result = filterProfileTweets(catalog, USER, 'replies')
    expect(result.map((t) => t.id).sort()).toEqual([
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ])
  })

  it('highlights includes liked or reacted own posts', () => {
    const result = filterProfileTweets(catalog, USER, 'highlights')
    expect(result.map((t) => t.id)).toEqual(['cccccccc-cccc-cccc-cccc-cccccccccccc'])
  })

  it('likes includes posts where likedBy contains the user', () => {
    const result = filterProfileTweets(catalog, USER, 'likes')
    expect(result.map((t) => t.id)).toEqual(['dddddddd-dddd-dddd-dddd-dddddddddddd'])
  })
})
