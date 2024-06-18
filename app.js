const express = require('express')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbpath = path.join(__dirname, 'twitterClone.db')
let db = null

const initializedb = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Successfully Running')
    })
  } catch (e) {
    console.log(`error in initializing :${e.message}`)
    process.exit(1)
  }
}

initializedb()

//register user details ----API-1
app.post('/register/', async (request, response) => {
  try {
    const userdetails = request.body
    const {username, password, name, gender} = userdetails
    const checkuserdbquery = `select * from user where username='${username}'`
    const checkuserdbresponse = await db.get(checkuserdbquery)
    console.log(checkuserdbresponse)
    if (checkuserdbresponse !== undefined) {
      response.status(400)
      response.send('User already exists')
    } else if (password.length >= 6) {
      const encryptedpassword = await bcrypt.hash(password, 10)
      const createuserquery = `insert into user(username,password,name,gender)
      values("${username}","${encryptedpassword}","${name}","${gender}")`
      await db.run(createuserquery)
      response.status(200)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } catch (e) {
    console.log(`${e.message}`)
  }
})

//login user----API-2
app.post('/login/', async (request, response) => {
  try {
    const userdetails = request.body
    const {username, password} = userdetails
    const checkuserdbquery = `select * from user where username='${username}'`
    const dbresponse = await db.get(checkuserdbquery)
    console.log(dbresponse)
    if (dbresponse === undefined) {
      response.status(400)
      response.send('Invalid user')
    } else {
      const checkpassword = await bcrypt.compare(password, dbresponse.password)
      if (checkpassword) {
        const payload = {
          userdetails: dbresponse,
        }
        const jwtToken = jwt.sign(payload, 'My_Jwt_Token')
        response.send({jwtToken})
        console.log(jwtToken)
      } else {
        response.status(400)
        response.send('Invalid password')
      }
    }
  } catch (e) {
    console.log(`${e.message}`)
  }
})

//Authenticate with JWT
const logger = async (request, response, next) => {
  try {
    let jwtToken
    const authHeader = request.headers['authorization']
    if (authHeader !== undefined) {
      jwtToken = authHeader.split(' ')[1]
    }
    if (jwtToken !== undefined) {
      jwt.verify(jwtToken, 'My_Jwt_Token', async (error, payload) => {
        if (error) {
          response.status(401)
          response.send('Invalid JWT Token')
        } else {
          const {userdetails} = payload
          request.username = userdetails.username
          request.name = userdetails.name
          request.userId = userdetails.user_id

          next()
        }
      })
    } else {
      response.status(401)
      response.send('Invalid JWT Token')
    }
  } catch (e) {
    console.log(`${e.message}`)
  }
}

//latest tweets of people whom the user follows ----API-3
app.get('/user/tweets/feed/', logger, async (request, response) => {
  try {
    const {userId} = request
    console.log(userId)
    const dbquery = `select username,tweet, date_time as dateTime
     from (follower inner join tweet 
    on follower.following_user_id=tweet.user_id ) as t inner join user 
    on user.user_id=t.following_user_id
     where follower.follower_user_id='${userId}'
     order by tweet.date_time desc
     limit 4
     `
    const dbresponse = await db.all(dbquery)
    response.send(dbresponse)
  } catch (e) {
    console.log(`${e.message}`)
  }
})

//list of all names of people whom the user follows----API-4
app.get('/user/following/', logger, async (request, response) => {
  try {
    const {userId} = request
    console.log(userId)
    const dbquery = `select name from 
    follower  inner join user 
    on user.user_id=follower.following_user_id
     where follower.follower_user_id='${userId}'
   
     `
    const dbresponse = await db.all(dbquery)
    response.send(dbresponse)
  } catch (e) {
    console.log(`${e.message}`)
  }
})

//list of all names of people who follows the user----API-5
app.get('/user/followers/', logger, async (request, response) => {
  try {
    const {userId} = request
    console.log(userId)
    const dbquery = `select name from 
    follower  inner join user 
    on user.user_id=follower.follower_user_id
     where follower.following_user_id='${userId}'
   
     `
    const dbresponse = await db.all(dbquery)
    response.send(dbresponse)
  } catch (e) {
    console.log(`${e.message}`)
  }
})

//user requests a tweet of the user he is following----API-6
app.get('/tweets/:tweetId/', logger, async (request, response) => {
  try {
    const {userId} = request
    const {tweetId} = request.params
    const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`
    const tweetsResult = await db.get(tweetsQuery)
    const userFollowersQuery = `
        SELECT  *
         FROM  follower INNER JOIN user ON user.user_id = follower.following_user_id 
       WHERE 
            follower.follower_user_id  = ${userId} 
    ;`
    const userFollowers = await db.all(userFollowersQuery)
    console.log(userFollowers)
    if (
      userFollowers.some(
        item => item.following_user_id === tweetsResult.user_id,
      )
    ) {
      const dbquery = `select tweet.tweet, count(distinct(like.user_id)) as likes , 
                              count(distinct(reply.user_id)) as replies,
                               tweet.date_time as dateTime
                        from tweet inner join like on tweet.tweet_id=like.tweet_id
                       inner join reply on reply.tweet_id=tweet.tweet_id
                       where tweet.tweet_id='${tweetId}' `
      const dbresponse = await db.get(dbquery)
      response.send(dbresponse)
      console.log(dbresponse)
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  } catch (e) {
    console.log(`${e.message}`)
  }
})

//list of usernames who liked the tweet----API-7
app.get('/tweets/:tweetId/likes/', logger, async (request, response) => {
  try {
    const {userId} = request
    const {tweetId} = request.params
    const dbquery = `select *
     from follower inner join tweet 
    on follower.following_user_id=tweet.user_id
     where follower.follower_user_id='${userId}' and tweet.tweet_id='${tweetId}'`

    const dbresponse = await db.get(dbquery)
    if (dbresponse === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const likequery = `select username from like inner join user 
      on like.user_id=user.user_id
      where like.tweet_id='${tweetId}'`
      const likeresponse = await db.all(likequery)
      const likes = likeresponse.map(each => each.username)
      response.send({likes})
      console.log({likes})
    }
  } catch (e) {
    console.log(`${e.message}`)
  }
})

//list of usernames who liked the tweet----API-8
app.get('/tweets/:tweetId/replies/', logger, async (request, response) => {
  try {
    const {userId} = request
    const {tweetId} = request.params
    const dbquery = `select *
     from follower inner join tweet 
    on follower.following_user_id=tweet.user_id
     where follower.follower_user_id='${userId}' and tweet.tweet_id='${tweetId}'`

    const dbresponse = await db.get(dbquery)
    if (dbresponse === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const likequery = `select * from reply inner join user 
      on reply.user_id=user.user_id
      where reply.tweet_id='${tweetId}'`
      const replyresponse = await db.all(likequery)
      const replydetails = replyobj => {
        return {
          name: replyobj.name,
          reply: replyobj.reply,
        }
      }
      const replies = replyresponse.map(each => replydetails(each))
      response.send({replies})
      console.log({replies})
    }
  } catch (e) {
    console.log(`${e.message}`)
  }
})

//list of all tweets of the user----API-9
app.get('/user/tweets/', logger, async (request, response) => {
  try {
    const {userId} = request
    const dbquery = `select  tweet.tweet AS tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
     from (reply inner join tweet 
    on reply.tweet_id=tweet.tweet_id ) as t inner join like
    on like.tweet_id=t.tweet_id
     where tweet.user_id='${userId}'
     group by tweet.tweet_id`

    const dbresponse = await db.all(dbquery)
    response.send(dbresponse)
    console.log(dbresponse)
  } catch (e) {
    console.log(`${e.message}`)
  }
})

//Create a tweet in the tweet table----API-10
app.post('/user/tweets/', logger, async (request, response) => {
  try {
    const {userId} = request
    const {tweet} = request.body
    console.log(tweet)
    const dbquery = `insert into tweet(tweet,user_id) values("${tweet}",'${userId}')`

    await db.run(dbquery)
    response.send('Created a Tweet')
  } catch (e) {
    console.log(`${e.message}`)
  }
})

//deletes users tweet----API-11
app.delete('/tweets/:tweetId/', logger, async (request, response) => {
  try {
    const {userId} = request
    const {tweetId} = request.params
    const checktweetquery = `select * from tweet 
    where tweet_id='${tweetId}' and user_id='${userId}'`

    const checktweetresponse = await db.get(checktweetquery)
    if (checktweetresponse !== undefined) {
      const deletequery = `delete from tweet where tweet_id='${tweetId}'`
      await db.run(deletequery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  } catch (e) {
    console.log(`${e.message}`)
  }
})

module.exports = app
