const express = require('express')
const path = require('path')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const connectDBServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running')
    })
  } catch (error) {
    console.log('Db Error')
    process.exit(1)
  }
}
connectDBServer()

const getFollowingPeopleIdsOfUser = async username => {
  const getFollowingPeopleQuery = `
    select following_user_id from follower inner join user on user.user_id=follower.follower_user_id where user.username='${username}';
  `

  const followingPeople = await db.all(getFollowingPeopleQuery)
  const arrOfIds = followingPeople.map(eachuser => eachuser.following_user_id)
  return arrOfIds
}

// Authentication Token

const authentication = (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Invalid JWT Token')
  }

  const jwtToken = authHeader.split(' ')[1]

  jwt.verify(jwtToken, 'SECRET_KEY', (error, payload) => {
    if (error) {
      return res.status(401).send('Invalid JWT Token')
    }

    req.username = payload.username
    req.userId = payload.userId // Ensure userId is in the JWT payload when token is created
    next()
  })
}

//Tweet Access Verification

const tweetAccessVerification = async (req, res, next) => {
  const {userId} = req
  const {tweetId} = req.params
  const getTweetQuery = `select 
  * 
  from tweet inner join follower on tweet.user_id=follower.following_user_id
  where 
  tweet.tweet_id='${tweetId}' and follower_user_id='${userId}'`
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    res.status(4011)
    res.send('Invaild Request')
  } else {
    next()
  }
}

//API 1

app.post('/register/', async (req, res) => {
  const {username, password, name, gender} = req.body

  // Check if all required fields are present
  if (!username || !password || !name || !gender) {
    res.status(400)
    res.send('All fields (username, password, name, gender) are required.')
    return
  }

  const getUserQuery = `SELECT * FROM user WHERE username='${username}'`
  const userDBdetails = await db.get(getUserQuery)

  if (userDBdetails !== undefined) {
    res.status(400)
    res.send('User already exists')
  } else {
    // Check if the password is defined and has the required length
    if (password.length < 6) {
      res.status(400)
      res.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUserQuery = `
        INSERT INTO user (username, password, name, gender)
        VALUES ('${username}', '${hashedPassword}', '${name}', '${gender}')
      `
      await db.run(createUserQuery)
      res.send('User created successfully')
    }
  }
})

// API 2

app.post('/login/', async (req, res) => {
  const {username, password} = req.body
  const getUserQuery = `select * from user where username='${username}'`
  const userDBdetails = await db.get(getUserQuery)
  console.log(userDBdetails)

  if (userDBdetails !== undefined) {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      userDBdetails.password,
    )

    if (isPasswordCorrect) {
      const payload = {username, userId: userDBdetails.userId}
      const jwtToken = jwt.sign(payload, 'SECRET_KEY')
      res.send({jwtToken})
    } else {
      res.status(400)
      res.send('Invalid password')
    }
  } else {
    res.status(400)
    res.send('Invalid user')
  }
})

// API

app.get('/get/', async (req, res) => {
  const query = `select * from follower`
  const query2 = `select * from user`
  const response = await db.all(query)
  const response2 = await db.all(query2)
  res.send([response, response2])
})

// ApI 3

app.get('/user/tweets/feed/', authentication, async (req, res, next) => {
  const {username} = req
  const followingPeopleIds = await getFollowingPeopleIdsOfUser(username)

  const getTweetQuery = ` select 
  username,tweet,date_time as dataTime
  
  from user inner join tweet on user.user_id=tweet.user_id
  
  where 
  
  user.user_id in (${followingPeopleIds})
  
  order by date_time desc
  
  limit 4`

  const tweets = await db.all(getTweetQuery)
  res.send(tweets)
})

// API 4

app.get('/user/following/', authentication, async (req, res) => {
  const {username} = req
  const queryy = `select * from user where username='${username}'`
  const res1 = await db.get(queryy)
  const userId = res1.user_id
  const getFollowingUserQuery = `select name  from follower 
  
  inner join user on user.user_id=follower.following_user_id
  
  where follower_user_id='${userId}';`

  const followingPeople = await db.all(getFollowingUserQuery)
  res.send(followingPeople)
})

// API 5

app.get('/user/followers/', authentication, async (req, res) => {
  const {username} = req
  const queryy = `select * from user where username='${username}'`
  const res1 = await db.get(queryy)
  const userId = res1.user_id

  const getFollowingQuery = `select distinct name from follower 
  inner join user on user.user_id =follower.follower_user_id
  where following_user_id='${userId}';`

  const followers = await db.all(getFollowingQuery)
  res.send(followers)
})

// API 6

app.get(
  '/tweets/:tweetId/',
  authentication,
  tweetAccessVerification,
  async (req, res) => {
    const {username, userId} = req

    const {tweetId} = req.params
    const getTweetQuery = `select tweet,
  (select count() from like where tweet_id=${tweetId}) as likes,
  (select count() from reply wwhere tweet_id=${tweetId}) as replies,date_time as dateTime
  
  from tweet 
  
  where tweet.tweet_id='${tweetId}'`

    const tweet = await db.get(getTweetQuery)
    res.send(tweet)
  },
)

/*
// API 7

app.get("/tweets/:tweetId/likes",authentication,tweetAccessVerification,async(req,res)=>{
  const {tweetId}=req.params
  const getLikesQuery=`select 
  username 
  from user inner join like on user.user_id=like.user_id
  
  where tweet_id='${tweetId}';`;

  const likedUsers=await db.all(getLikesQuery)
  const usersArray=likedUsers.map((x)=> x.username)
  res.send({likes:usersArray})
})








// API 8

app.get("/tweets/:tweetId/replies/",authentication,tweetAccessVerification,async(req,res)=>{
  const {tweetId}=req.tweetId
  const query=`
  select name,reply from user inner join reply on user.user_id=reply.user_id
  where tweet_id='${tweetId}'`
  const repliedUsers=await db.all(query)
  res.send({replies:repliedUsers})
})






// API 9

app.get("/user/tweets/",authentication,async(req,res)=>{
  const {userId}=req 

  const getTweetsQuery=`
  
  select tweet , 
  count(distinct like_id) as likes, 
  count(distinct reply_id) as replies,date_time as dateTime
  
  from tweet left join reply on tweet.tweet_id =reply.tweet_id left join like on tweet.tweet_id=like.tweet_id
  where tweet.user_id=${userId} 
  
  group by tweet.tweet_id;`;

  const tweets=await db.all(getTweetsQuery)

  res.send(tweets)
})

// API 10

app.post("/user/tweets/",authentication,async (req,res)=>{
  const {tweet}=req.body 
  const userId=parseInt(req.userId)
  const dateTime=new Date().toJSON().substring(0,19).replace("T"," ")

  const creteTweetQuery=`Insert into tweet(tweet,user_id,date_time)
  values('${tweet}','${userId}','${dateTime}')`;

  await db.run(creteTweetQuery)
  res.send("Created a Tweet")
})


// API 11

app.delete("/tweets/:tweetId",authentication,async(req,res)=>{
  const {tweetId}=req.params
  const {userId}=req
  const getTheTweetQuery=`select * from twweet where user_id='${userId}' and tweet_id='${tweetId}'`;
  const tweet=await db.get(getTheTweetQuery)
  console.log(tweet)
  if (tweet===undefined){
    res.status(401)
    res.send("Invalid Request")
  }else{
    const deleteTweetQuery=`delect from tweet where tweet_id='${tweetId}'`;
    await db.run(deleteTweetQuery)
    res.send("Tweet Removed")
  }
})
*/
module.exports = app
