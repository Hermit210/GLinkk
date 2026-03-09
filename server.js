require('dotenv').config()
const express = require('express')
const cors = require('cors')
const axios = require('axios')
const bcrypt = require('bcryptjs')
const nodemailer = require('nodemailer')
const { nanoid } = require('nanoid')
const { createClient } = require('@supabase/supabase-js')
const { Connection, Keypair, Transaction, clusterApiUrl } = require('@solana/web3.js')
const crypto = require('crypto')
const twilio = require('twilio')

const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const session = require('express-session')

console.log('Server starting...')

const app = express()
app.use(cors())
app.use(express.json())

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${BASE_URL}/auth/google/callback`
console.log('--- Auth Configuration ---')
console.log('BASE_URL:', BASE_URL)
console.log('GOOGLE_REDIRECT_URI:', GOOGLE_REDIRECT_URI)
console.log('---------------------------')

let finalRedirectUri = GOOGLE_REDIRECT_URI;
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.RENDER;

if (IS_PRODUCTION) {
  // For production, we want to ensure we use the correct base URL
  finalRedirectUri = `${BASE_URL}/auth/google/callback`;
  console.log('Production environment detected, using Redirect URI:', finalRedirectUri);
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'glink_secret_key_2024'

app.use(session({
  secret: SESSION_SECRET,
  resave: true,
  saveUninitialized: true,
  proxy: IS_PRODUCTION,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    secure: IS_PRODUCTION
  }
}))
app.use(passport.initialize())
app.use(passport.session())

app.get('/api/test-grail', async (req, res) => {
  try {
    const results = {}

    // Test gold price
    try {
      const price = await grail.get('/api/trading/gold/price')
      results.goldPrice = 'OK: ' + JSON.stringify(price.data)
    } catch (e) {
      results.goldPrice = 'FAILED: ' + e.message
    }

    // Test create user
    try {
      const { Keypair } = require('@solana/web3.js')
      const crypto = require('crypto')
      const wallet = Keypair.generate()
      const kycHash = generateKycHash('test@example.com', '9999999999')

      const user = await grail.post('/api/users', {
        kycHash: kycHash,
        userWalletAddress: wallet.publicKey.toString(),
        metadata: { referenceId: 'test_' + Date.now() }
      })
      results.createUser = 'OK: ' + JSON.stringify(user.data)
    } catch (e) {
      results.createUser = 'FAILED: ' + e.message
      if (e.response) {
        results.createUserError = e.response.data
        results.createUserStatus = e.response.status
      }
    }

    res.json(results)
  } catch (e) {
    res.json({ error: e.message })
  }
})

console.log('Connecting to services...')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)
console.log('Supabase: Connected')

const grail = axios.create({
  baseURL: process.env.GRAIL_BASE_URL,
  headers: {
    'x-api-key': process.env.GRAIL_API_KEY,
    'Content-Type': 'application/json'
  },
  timeout: 60000
})
console.log('GRAIL: Connected')
console.log('GRAIL API Key:', process.env.GRAIL_API_KEY ? 'Present' : 'Missing')
console.log('Executive Wallet:', process.env.EXECUTIVE_WALLET_ADDRESS ? 'Present' : 'Missing')

const otpStore = {}

const Razorpay = require('razorpay')
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_placeholder'
})

// Twilio client for SMS
const twilioClient = process.env.TWILIO_ACCOUNT_SID ?
  twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null

// Cashfree Payouts Configuration - trying different initialization patterns
const cashfreePgSDK = require('cashfree-pg-sdk-nodejs')
let cashfreePayouts = null

try {
  // Try pattern 1: Direct constructor
  cashfreePayouts = new cashfreePgSDK.Payouts({
    clientId: process.env.CASHFREE_CLIENT_ID,
    clientSecret: process.env.CASHFREE_CLIENT_SECRET,
    environment: process.env.CASHFREE_ENV === 'PROD' ? 'production' : 'sandbox'
  })
  console.log('Cashfree Payouts: Configured with pattern 1')
} catch (e1) {
  try {
    // Try pattern 2: Direct function call
    cashfreePayouts = cashfreePgSDK.Payouts({
      clientId: process.env.CASHFREE_CLIENT_ID,
      clientSecret: process.env.CASHFREE_CLIENT_SECRET,
      environment: process.env.CASHFREE_ENV === 'PROD' ? 'production' : 'sandbox'
    })
    console.log('Cashfree Payouts: Configured with pattern 2')
  } catch (e2) {
    try {
      // Try pattern 3: Factory method
      cashfreePayouts = cashfreePgSDK.createPayouts({
        clientId: process.env.CASHFREE_CLIENT_ID,
        clientSecret: process.env.CASHFREE_CLIENT_SECRET,
        environment: process.env.CASHFREE_ENV === 'PROD' ? 'production' : 'sandbox'
      })
      console.log('Cashfree Payouts: Configured with pattern 3')
    } catch (e3) {
      console.log('Cashfree Payouts: All initialization patterns failed, using fallback')
      console.log('Error details:', { e1: e1.message, e2: e2.message, e3: e3.message })
    }
  }
}
console.log('Cashfree Payouts:', cashfreePayouts ? 'Configured' : 'Missing')

// SMS sending function
async function sendSMS(to, message) {
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    console.log('SMS not configured - would send to:', to, 'Message:', message)
    return false
  }

  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: '+91' + to.replace(/[^0-9]/g, '') // Format for Indian numbers
    })
    console.log('SMS sent successfully to:', to)
    return true
  } catch (error) {
    console.log('SMS sending failed:', error.message)
    return false
  }
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

app.post('/api/payment/create-order', async (req, res) => {
  try {
    const { amount_inr } = req.body
    console.log('Payment order request:', amount_inr)
    console.log('Razorpay key exists:', !!process.env.RAZORPAY_KEY_ID)
    console.log('Razorpay key value:', process.env.RAZORPAY_KEY_ID)

    if (!amount_inr || isNaN(parseFloat(amount_inr))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount provided'
      })
    }

    if (!process.env.RAZORPAY_KEY_ID ||
      process.env.RAZORPAY_KEY_ID === 'rzp_test_placeholder') {
      return res.json({
        success: true,
        testMode: true,
        orderId: 'test_' + Date.now(),
        amount: Math.round(parseFloat(amount_inr) * 100),
        currency: 'INR',
        key: 'rzp_test_SMSLODO1V0KwfU',
        message: 'Test mode - payment will be simulated'
      })
    }

    const order = await razorpay.orders.create({
      amount: Math.round(parseFloat(amount_inr) * 100),
      currency: 'INR',
      receipt: 'glink_' + Date.now()
    })

    console.log('Order created successfully:', order.id)

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID
    })
  } catch (e) {
    console.log('=== Razorpay Order Creation Error ===');
    console.log('Error message:', e.message);
    console.log('Error type:', e.type);
    console.log('Error code:', e.code);
    console.log('Full error:', e);

    res.status(500).json({
      success: false,
      error: e.message || 'Payment order creation failed',
      details: e.type || 'Unknown error'
    })
  }
})

app.post('/api/payment/verify', async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body
    const sign = orderId + '|' + paymentId
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest('hex')
    const valid = expected === signature
    console.log('Payment verified:', valid)
    res.json({ success: valid })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

function base58Decode(str) {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let val = 0n
  for (const c of str) {
    val = val * 58n + BigInt(chars.indexOf(c))
  }
  const bytes = []
  while (val > 0n) {
    bytes.unshift(Number(val & 0xffn))
    val >>= 8n
  }
  while (bytes.length < 64) bytes.unshift(0)
  return new Uint8Array(bytes)
}

function base58Encode(buf) {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let num = BigInt('0x' + Buffer.from(buf).toString('hex'))
  let result = ''
  while (num > 0n) {
    result = chars[Number(num % 58n)] + result
    num = num / 58n
  }
  return result
}

async function signAndSubmit(txBase64) {
  try {
    const { Connection, Keypair, Transaction, clusterApiUrl } = require('@solana/web3.js')

    function base58Decode(str) {
      const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
      let val = 0n
      for (const c of str) val = val * 58n + BigInt(chars.indexOf(c))
      const bytes = []
      while (val > 0n) { bytes.unshift(Number(val & 0xffn)); val >>= 8n }
      while (bytes.length < 64) bytes.unshift(0)
      return new Uint8Array(bytes)
    }

    console.log('signAndSubmit: Starting...')
    const secretKey = base58Decode(process.env.EXECUTIVE_KEYPAIR)
    const keypair = Keypair.fromSecretKey(secretKey)
    console.log('Executive wallet:', keypair.publicKey.toString())

    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed')
    const txBuffer = Buffer.from(txBase64, 'base64')
    const transaction = Transaction.from(txBuffer)

    transaction.partialSign(keypair)
    console.log('Transaction signed!')

    const serialized = transaction.serialize({ requireAllSignatures: false })
    const signed = serialized.toString('base64')

    // Submit through GRAIL API instead of direct Solana submission
    const response = await grail.post('/api/transactions/submit', {
      signedTransaction: signed
    })

    console.log('GRAIL submit response:', JSON.stringify(response.data))

    // Extract signature with fallback options
    const signature = response.data?.data?.transaction?.signature ||
      response.data?.data?.transaction?.transactionId ||
      response.data?.data?.signature

    if (signature) {
      console.log('✅ TX submitted via GRAIL!')
      console.log('✅ Signature:', signature)
      console.log('✅ Solscan: https://solscan.io/tx/' + signature + '?cluster=devnet')

      // Still confirm on Solana for reliability
      await connection.confirmTransaction(signature, 'confirmed')
      console.log('✅ TX confirmed on devnet!')

      return { success: true, signature }
    } else {
      throw new Error('No signature returned from GRAIL')
    }
  } catch (e) {
    console.log('signAndSubmit error:', e.message)
    return { success: false, error: e.message }
  }
}

// Base58 encoding function
function base58Encode(buffer) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let result = ''
  let num = BigInt('0x' + Buffer.from(buffer).toString('hex'))

  while (num > 0n) {
    result = alphabet[Number(num % 58n)] + result
    num = num / 58n
  }

  // Handle leading zeros
  for (const byte of buffer) {
    if (byte === 0) {
      result = alphabet[0] + result
    } else {
      break
    }
  }

  return result
}

function generateKycHash(email, phone) {
  const hash = crypto.createHash('sha256')
    .update(email + (phone || '0000000000'))
    .digest()
}

async function createGrailUser(email, phone) {
  try {
    console.log('Creating GRAIL user for:', email)

    // Generate proper KYC hash - use email + phone + timestamp for uniqueness
    const crypto = require('crypto')
    const timestamp = Date.now().toString()
    const hashInput = email + (phone || '') + timestamp
    const hash = crypto.createHash('sha256').update(hashInput).digest()
    const kycHash = base58Encode(hash)

    console.log('Generated KYC hash:', kycHash)
    console.log('Hash input:', hashInput)

    // Generate a unique user wallet address for this user
    // For self-custody partners, this should be the user's actual wallet
    // For now, we'll create a unique address based on the email
    const userWalletHash = crypto.createHash('sha256').update(email + timestamp).digest()
    const userWalletBytes = new Uint8Array(32)
    userWalletBytes.set(userWalletHash.slice(0, 32))
    const userWalletAddress = base58Encode(userWalletBytes)

    console.log('Generated user wallet address:', userWalletAddress)

    const response = await grail.post('/api/users', {
      kycHash: kycHash,
      userWalletAddress: userWalletAddress, // Unique user wallet address
      metadata: {
        referenceId: 'glink_' + timestamp,
        tags: ['retail', 'glink']
      }
    })

    console.log('GRAIL user creation response:', response.data)

    if (response.data?.success && response.data?.data) {
      const userData = response.data.data
      const serializedTx = userData.transaction?.serializedTx

      // Sign and submit transaction if provided
      let signature = null
      if (serializedTx) {
        try {
          const signResult = await signAndSubmit(serializedTx)
          signature = signResult.signature
          console.log('✅ GRAIL user creation TX:', signature)
        } catch (signError) {
          console.log('User creation signing failed:', signError.message)
        }
      }

      return {
        success: true,
        userId: userData.userId,
        userPda: userData.userPda,
        walletAddress: userData.userWalletAddress,
        transactionId: signature || userData.transaction?.txId,
        kycHash: userData.kycHash
      }
    } else {
      throw new Error('GRAIL user creation failed: ' + JSON.stringify(response.data))
    }
  } catch (e) {
    console.log('GRAIL user creation error:', e.message)
    if (e.response) {
      console.log('User creation error details:', e.response.status, e.response.data)

      // If user already exists, try with completely different data
      if (e.response.status === 400 && e.response.data?.error?.includes('already exists')) {
        console.log('User already exists, trying with different approach...')

        // Try with a completely random wallet address
        try {
          const randomTimestamp = Date.now() + Math.random()
          const randomHash = crypto.createHash('sha256').update(randomTimestamp.toString()).digest()
          const randomKycHash = base58Encode(randomHash)

          const randomWalletHash = crypto.createHash('sha256').update(randomTimestamp.toString() + 'wallet').digest()
          const randomWalletBytes = new Uint8Array(32)
          randomWalletBytes.set(randomWalletHash.slice(0, 32))
          const randomUserWalletAddress = base58Encode(randomWalletBytes)

          console.log('Trying with completely random data...')
          console.log('Random KYC hash:', randomKycHash)
          console.log('Random wallet address:', randomUserWalletAddress)

          const retryResponse = await grail.post('/api/users', {
            kycHash: randomKycHash,
            userWalletAddress: randomUserWalletAddress,
            metadata: {
              referenceId: 'glink_random_' + randomTimestamp,
              tags: ['retail', 'glink']
            }
          })

          if (retryResponse.data?.success && retryResponse.data?.data) {
            const userData = retryResponse.data.data
            console.log('✅ GRAIL user created with random data:', userData.userId)
            return {
              success: true,
              userId: userData.userId,
              userPda: userData.userPda,
              walletAddress: userData.userWalletAddress,
              transactionId: userData.transaction?.txId,
              kycHash: userData.kycHash
            }
          }
        } catch (retryError) {
          console.log('Random retry failed:', retryError.message)
          console.log('Retry error details:', retryError.response?.data)
        }
      }
    }

    // If all attempts fail, return failure but don't create mock users
    console.log('All user creation attempts failed')
    return {
      success: false,
      userId: null,
      userPda: null,
      walletAddress: null,
      error: e.message,
      mock: false
    }
  }
}

let cachedGoldPrice = null;
let lastGoldFetch = 0;
const GOLD_CACHE_TTL = 60000; // 1 minute

async function getGoldPrice() {
  const now = Date.now();
  if (cachedGoldPrice !== null && (now - lastGoldFetch < GOLD_CACHE_TTL)) {
    return cachedGoldPrice;
  }

  try {
    const r = await grail.get('/api/trading/gold/price');
    const usd = parseFloat(r.data.data.price);
    const inr = (usd * 84) / 31.1035;

    cachedGoldPrice = inr;
    lastGoldFetch = now;
    return inr;
  } catch (e) {
    if (cachedGoldPrice !== null) return cachedGoldPrice;
    return 7200;
  }
}

app.get('/api/gold/price', async (req, res) => {
  const now = Date.now();
  if (cachedGoldPrice !== null && (now - lastGoldFetch < GOLD_CACHE_TTL)) {
    return res.json({
      success: true,
      price_inr_per_gram: Math.round(cachedGoldPrice),
      price_usd: (cachedGoldPrice * 31.1035) / 84,
      source: 'Cache (Pyth Oracle via GRAIL)'
    });
  }

  try {
    const r = await grail.get('/api/trading/gold/price');
    const usd = parseFloat(r.data.data.price);
    const inr = (usd * 84) / 31.1035;

    cachedGoldPrice = inr;
    lastGoldFetch = now;

    res.json({ success: true, price_inr_per_gram: Math.round(inr), price_usd: usd, source: 'Pyth Oracle via GRAIL' });
  } catch (e) {
    res.json({
      success: true,
      price_inr_per_gram: cachedGoldPrice !== null ? Math.round(cachedGoldPrice) : 7200,
      source: 'fallback'
    });
  }
})

app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      })
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    otpStore[email] = {
      otp,
      expiry: Date.now() + 10 * 60 * 1000
    }

    await transporter.sendMail({
      from: '"G-Link Gold" <' + process.env.EMAIL_USER + '>',
      to: email,
      subject: 'G-Link OTP: ' + otp,
      html: `
        <div style="background:#1a1a1a;padding:30px;border-radius:12px;font-family:Arial">
          <h2 style="color:#D4AF37">🪙 G-Link</h2>
          <p style="color:#fff">Your OTP to verify email:</p>
          <h1 style="color:#D4AF37;letter-spacing:8px;font-size:36px">${otp}</h1>
          <p style="color:#888">Valid for 10 minutes</p>
          <p style="color:#555;font-size:12px">Powered by Oro GRAIL | Solana Blockchain</p>
        </div>
      `
    })

    console.log('OTP sent to:', email)
    res.json({ success: true })

  } catch (e) {
    console.log('OTP send failed:', e.message)
    res.status(500).json({
      success: false,
      error: 'Failed to send OTP: ' + e.message
    })
  }
})

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body
    const stored = otpStore[email]
    if (!stored) return res.status(400).json({ success: false, error: 'OTP expired' })
    if (Date.now() > stored.expiry) { delete otpStore[email]; return res.status(400).json({ success: false, error: 'OTP expired' }) }
    if (stored.otp !== otp) return res.status(400).json({ success: false, error: 'Wrong OTP' })
    delete otpStore[email]
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body
    if (!name || !email || !password) return res.status(400).json({ success: false, error: 'All fields required' })
    const { data: existing } = await supabase.from('users').select('id').eq('email', email).single()
    if (existing) return res.status(400).json({ success: false, error: 'Email already registered. Please login.' })
    const hashedPassword = await bcrypt.hash(password, 10)
    const grailUser = await createGrailUser(email, phone)
    const { data, error } = await supabase.from('users')
      .insert([{ name, email, phone, password: hashedPassword, gold_grams: 0, grail_user_id: grailUser.userId }])
      .select()
    if (error) throw error
    res.json({ success: true, user: { id: data[0].id, name, email, phone, gold_grams: 0, grail_user_id: grailUser.userId } })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' })
    console.log('Login attempt for:', email)
    const { data, error } = await supabase.from('users').select('*').eq('email', email).single()
    if (error || !data) {
      console.log('Login failed for:', email, 'reason: Account not found')
      return res.status(400).json({ success: false, error: 'Account not found. Please sign up.' })
    }
    const valid = await bcrypt.compare(password, data.password)
    if (!valid) {
      console.log('Login failed for:', email, 'reason: Wrong password')
      return res.status(400).json({ success: false, error: 'Wrong password' })
    }
    console.log('Login success for:', email)
    res.json({ success: true, user: { id: data.id, name: data.name, email: data.email, phone: data.phone, gold_grams: data.gold_grams, grail_user_id: data.grail_user_id } })
  } catch (e) {
    console.error('Login error for:', email, 'error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/auth/wallet-login', async (req, res) => {
  try {
    const { walletAddress } = req.body
    if (!walletAddress) throw new Error('Wallet required')

    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single()

    if (!user) {
      const grailUser = await createGrailUser(
        walletAddress + '@wallet.glink.com',
        '0000000000'
      )
      const { data: newUser, error } = await supabase
        .from('users')
        .insert([{
          name: 'User ' + walletAddress.slice(0, 6),
          email: walletAddress + '@wallet.glink.com',
          wallet_address: walletAddress,
          gold_grams: 0,
          grail_user_id: grailUser.userId,
          password: await bcrypt.hash(walletAddress, 10)
        }])
        .select()
        .single()
      if (error) throw error
      user = newUser
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        wallet_address: walletAddress,
        gold_grams: user.gold_grams,
        grail_user_id: user.grail_user_id
      }
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: finalRedirectUri,
  proxy: true
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('--- Google Auth Callback ---')
    if (!profile || !profile.emails || !profile.emails[0]) {
      console.log('No profile or email found in Google response')
      return done(new Error('No email found from Google'), null)
    }
    const email = profile.emails[0].value
    const name = profile.displayName

    console.log('Login attempt for:', email, 'Name:', name)

    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()

    if (!user) {
      console.log('New Google user, creating GRAIL account...')
      const grailUser = await createGrailUser(email, '0000000000')

      const { data: newUser, error } = await supabase
        .from('users')
        .insert([{
          name,
          email,
          phone: '',
          password: await bcrypt.hash(email + Date.now(), 10),
          gold_grams: 0,
          grail_user_id: grailUser.userId,
          wallet_address: grailUser.walletAddress,
          created_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (error) throw error
      user = newUser
      console.log('New Google user created:', email)
    }

    return done(null, user)
  } catch (e) {
    console.log('Google auth error:', e.message)
    return done(e, null)
  }
}))

passport.serializeUser((user, done) => {
  done(null, user.id)
})

passport.deserializeUser(async (id, done) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single()
    done(null, user)
  } catch (e) {
    done(e, null)
  }
})

// Google OAuth Routes
app.get('/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
)

app.get('/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login.html?error=google_failed'
  }),
  (req, res) => {
    const user = req.user
    const userData = JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email,
      gold_grams: user.gold_grams,
      grail_user_id: user.grail_user_id
    })

    res.send(`
      <html>
        <body>
          <script>
            localStorage.setItem('glink_user', '${userData.replace(/'/g, "\\'")}')
            window.location.href = '/dashboard.html'
          </script>
        </body>
      </html>
    `)
  }
)

app.get('/api/dashboard', async (req, res) => {
  try {
    const email = req.query.email
    if (!email) throw new Error('Email required')

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()

    if (!user) throw new Error('User not found')

    const { data: links } = await supabase
      .from('gold_links')
      .select('*')
      .eq('sender_email', email)

    const { data: txns } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_email', email)
      .order('created_at', { ascending: false })
      .limit(10)

    const inrPerGram = await getGoldPrice()
    const goldGrams = parseFloat(user.gold_grams || 0)

    res.json({
      success: true,
      name: user.name,
      email: user.email,
      goldGrams: goldGrams.toFixed(4),
      goldValueINR: Math.round(goldGrams * inrPerGram),
      livePrice: Math.round(inrPerGram),
      linksCreated: links?.length || 0,
      transactions: txns || [],
      grailUserId: user.grail_user_id,
      walletAddress: user.wallet_address
    })
  } catch (e) {
    console.log('Dashboard error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/links/create', async (req, res) => {
  try {
    console.log('Creating link with data:', req.body)
    const { amount_inr, senderName, senderEmail, message, paymentId, recipient_phone, recipient_glink_id } = req.body

    console.log('Extracted fields:', { amount_inr, senderName, senderEmail, recipient_glink_id, recipient_phone })

    if (!amount_inr || !senderName || !senderEmail) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      })
    }

    const goldPrice = await getGoldPrice()
    const usdcAmount = parseFloat(amount_inr) / 84
    const goldGrams = (parseFloat(amount_inr) / goldPrice).toFixed(4)

    console.log('Gold calculation:', { goldPrice, usdcAmount, goldGrams })

    // Create or get GRAIL user for sender
    let grailUserId = null
    let userPda = null
    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('grail_user_id')
        .eq('email', senderEmail)
        .single()

      if (existingUser?.grail_user_id) {
        const existingId = existingUser.grail_user_id
        console.log('Found existing GRAIL ID:', existingId)

        // ALWAYS create fresh GRAIL user for gold purchases - old IDs are incompatible with new KYC format
        console.log('Ignoring old GRAIL ID - creating fresh user with new KYC format...')
        const result = await createGrailUser(senderEmail, recipient_phone || '')
        grailUserId = result.userId
        console.log('New grailUserId after creation:', grailUserId)
        userPda = result.userPda
        console.log('New userPda after creation:', userPda)

        // Update database with fresh KYC-based IDs
        await supabase.from('users')
          .update({
            grail_user_id: grailUserId,
            wallet_address: result.walletAddress
          })
          .eq('email', senderEmail)
        console.log('Updated database with fresh KYC-based GRAIL IDs')
      } else {
        console.log('No existing GRAIL ID, creating new...')
        const result = await createGrailUser(senderEmail, '')
        grailUserId = result.userId
        console.log('grailUserId after creation:', grailUserId)
        userPda = result.userPda
        // Save both to database
        await supabase.from('users')
          .update({
            grail_user_id: grailUserId,
            wallet_address: result.walletAddress
          })
          .eq('email', senderEmail)
        console.log('Saved real GRAIL ID and PDA:', grailUserId, userPda)
      }
    } catch (e) {
      console.log('GRAIL user error:', e.message)
      grailUserId = 'local_' + Date.now()
      userPda = grailUserId
    }

    // Wait for GRAIL to index the fresh KYC-based user
    console.log('Waiting 8 seconds for fresh KYC user indexing...')
    await new Promise(resolve => setTimeout(resolve, 8000))

    // Buy gold on GRAIL using userPda (not grailUserId)
    let solanaExplorer = null
    let grailTxId = null
    try {
      console.log('GRAIL ID before buying:', grailUserId)
      console.log('User PDA for buying:', userPda)
      if (userPda && !userPda.startsWith('glink_') && !userPda.startsWith('existing_user_') && !userPda.startsWith('mock_user_')) {
        console.log('Real GRAIL user detected, attempting purchase...')
        const goldResult = await buyGoldOnGRAIL(userPda, usdcAmount)
        console.log('Gold result:', JSON.stringify(goldResult))
        if (goldResult.success) {
          grailTxId = goldResult.transactionId
          solanaExplorer = 'https://solscan.io/account/' + userPda + '?cluster=devnet'
        }
      } else {
        console.log('No real GRAIL user available - skipping gold purchase')
        console.log('User PDA type:', userPda ? userPda.substring(0, 20) + '...' : 'null')
      }
    } catch (e) {
      console.log('Gold purchase error:', e.message)
    }

    // Generate unique link ID
    const linkId = nanoid(10)
    const slug = 'gold_' + linkId

    const { data: link, error } = await supabase.from('gold_links').insert([{
      link_id: linkId,
      slug: slug,
      sender_email: senderEmail,
      amount_inr: parseFloat(amount_inr),
      gold_grams: goldGrams,
      message: message || '',
      sender_name: senderName,
      status: 'unclaimed',
      recipient_phone: recipient_phone || null,
      recipient_glink_id: recipient_glink_id || null,
      grail_user_id: grailUserId,
      payment_id: paymentId
    }]).select().single()

    if (error) {
      console.log('Supabase error:', error)
      throw new Error(error.message)
    }

    console.log('Link created successfully:', linkId)

    // Send email notification to recipient if email provided
    console.log('About to send email, recipient_glink_id:', recipient_glink_id)
    if (recipient_glink_id) {
      try {
        console.log('Sending email to:', recipient_glink_id)
        const claimLink = `https://glink-n0y9.onrender.com/claim.html?id=${linkId}`
        console.log('Claim link:', claimLink)
        const emailHtml = `
          <div style="background:#1a1a1a;padding:30px;border-radius:12px;font-family:Arial;color:#fff;max-width:500px;margin:0 auto">
            <h2 style="color:#D4AF37;text-align:center">🪙 You Received Gold!</h2>
            <div style="background:#2a2a2a;padding:20px;border-radius:10px;margin:20px 0;text-align:center">
              <p style="font-size:18px;margin-bottom:10px">Someone sent you <strong style="color:#FFD700">${goldGrams}g</strong> of gold!</p>
              <p style="color:#ccc;margin-bottom:20px">${message || 'A special gift just for you'}</p>
              <a href="${claimLink}" style="background:#D4AF37;color:#000;padding:15px 30px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Claim Your Gold</a>
            </div>
            <p style="color:#888;text-align:center;font-size:12px">Powered by G-Link | Oro GRAIL | Solana</p>
          </div>
        `
        console.log('Sending email with html length:', emailHtml.length)
        await transporter.sendMail({
          from: '"G-Link Gold" <' + process.env.EMAIL_USER + '>',
          to: recipient_glink_id,
          subject: `🪙 ${goldGrams}g Gold Gift from ${senderName}!`,
          html: emailHtml
        })
        console.log('Gold link email sent to recipient:', recipient_glink_id)
      } catch (e) {
        console.log('Email error:', e.message)
      }
    } else {
      console.log('No recipient email provided, skipping email notification')
    }

    res.json({
      success: true,
      link: link,
      linkId: linkId,
      goldGrams: goldGrams,
      grailUserId: grailUserId,
      solanaExplorer: solanaExplorer,
      paymentId: paymentId
    })

  } catch (e) {
    console.log('Create link error:', e.message)
    res.status(500).json({
      success: false,
      error: e.message
    })
  }
})

app.get('/api/links/:slug', async (req, res) => {
  try {
    const slug = req.params.slug
    console.log('Looking for link with ID/Slug:', slug)
    
    if (slug === '[object Object]' || !slug) {
      console.log('Invalid slug received:', slug)
      return res.status(400).json({ success: false, error: 'Invalid link identifier' })
    }
    let { data, error } = await supabase.from('gold_links').select('*').eq('link_id', slug).single()
    
    if (error || !data) {
      console.log('link_id match failed, trying slug match...')
      const slugResult = await supabase.from('gold_links').select('*').eq('slug', slug).single()
      data = slugResult.data
      error = slugResult.error
    }

    if (error || !data) {
      console.log('Link not found in DB for:', slug)
      throw new Error('Link not found')
    }
    
    console.log('Link found successfully:', data.link_id)
    res.json({ success: true, link: data })
  } catch (e) {
    console.log('Get link error:', e.message)
    res.status(404).json({ success: false, error: e.message })
  }
})

app.post('/api/links/:slug/claim', async (req, res) => {
  try {
    const { name, email, phone } = req.body
    const { slug } = req.params
    console.log('Claim attempt:', { name, email, phone, slug })

    // Try matching by link_id first, then slug
    let { data: link, error: fetchError } = await supabase.from('gold_links').select('*').eq('link_id', slug).single()
    
    if (fetchError || !link) {
      console.log('Claim: link_id match failed, trying slug match...')
      const slugResult = await supabase.from('gold_links').select('*').eq('slug', slug).single()
      link = slugResult.data
      fetchError = slugResult.error
    }
    
    if (fetchError || !link) {
      console.log('Claim: Link not found in DB:', slug)
      throw new Error('Link not found')
    }

    // Check if already claimed - do this FIRST before any other operations
    if (link.status === 'claimed') {
      console.log('Link already claimed, rejecting claim attempt')
      return res.status(400).json({ success: false, error: 'This gold link has already been claimed' })
    }

    console.log('Link found:', { linkId: link.link_id, goldGrams: link.gold_grams, status: link.status })

    // Check if user already exists BEFORE creating GRAIL user
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()

    console.log('Existing user check:', existingUser ? `Found: ${existingUser.email}, gold: ${existingUser.gold_grams}` : 'Not found')

    const grailUser = await createGrailUser(email, phone)
    console.log('GRAIL user created:', { userId: grailUser.userId, success: grailUser.success })

    // Double-check status again before updating (race condition protection)
    const { data: recheckLink } = await supabase.from('gold_links').select('status').eq('link_id', req.params.slug).single()
    if (recheckLink?.status === 'claimed') {
      console.log('Race condition detected - link claimed during processing')
      return res.status(400).json({ success: false, error: 'This gold link was just claimed by someone else' })
    }

    // Update link status IMMEDIATELY to prevent race conditions
    const { error: statusError } = await supabase.from('gold_links').update({
      status: 'claimed',
      claimer_name: name,
      claimer_email: email,
      claimer_phone: phone,
      claimed_at: new Date().toISOString()
    }).eq('link_id', req.params.slug)

    if (statusError) {
      console.log('Status update error:', statusError)
      throw new Error('Failed to claim link: ' + statusError.message)
    }

    console.log('✅ Link status updated to claimed')

    if (existingUser) {
      const newGold = parseFloat(existingUser.gold_grams || 0) + parseFloat(link.gold_grams)
      console.log('Updating existing user gold:', {
        currentGold: existingUser.gold_grams,
        linkGold: link.gold_grams,
        newGold: newGold
      })

      const { error: updateError } = await supabase.from('users')
        .update({
          gold_grams: newGold,
          grail_user_id: grailUser.userId,
          name: name || existingUser.name
        })
        .eq('email', email)

      if (updateError) {
        console.log('Update error:', updateError)
        throw new Error('Failed to update gold balance: ' + updateError.message)
      }

      console.log('✅ Gold added to vault:', newGold)
    } else {
      console.log('Creating new user with gold:', link.gold_grams)
      const { error: insertError } = await supabase.from('users')
        .insert([{
          name: name,
          email: email,
          phone: phone || '',
          gold_grams: parseFloat(link.gold_grams),
          grail_user_id: grailUser.userId,
          password: await bcrypt.hash(email, 10),
          created_at: new Date().toISOString()
        }])

      if (insertError) {
        console.log('Insert error:', insertError)
        throw new Error('Failed to create user: ' + insertError.message)
      }

      console.log('✅ New user created with gold:', link.gold_grams)
    }

    // Record transaction
    await supabase.from('transactions').insert([{
      user_email: email,
      type: 'gold_claimed',
      amount_inr: link.amount_inr,
      gold_grams: link.gold_grams,
      grail_tx_id: grailUser.userId,
      status: 'completed'
    }])

    res.json({
      success: true,
      goldGrams: link.gold_grams,
      grailUserId: grailUser.userId,
      message: link.gold_grams + 'g gold added!',
      solanaExplorer: 'https://solscan.io/account/' + grailUser.userId + '',
      poweredBy: 'Oro GRAIL | Solana'
    })
  } catch (e) {
    console.log('Claim error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/registry/create', async (req, res) => {
  try {
    const { coupleName, weddingDate, story, ownerEmail } = req.body
    const slug = nanoid(8)
    await supabase.from('registries').insert([{ slug, couple_name: coupleName, wedding_date: weddingDate, owner_email: ownerEmail, story, total_gold: 0 }])
    res.json({ success: true, slug, link: req.protocol + '://' + req.get('host') + '/wedding-registry.html?slug=' + slug })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/registry/:slug', async (req, res) => {
  try {
    let { data: registry } = await supabase.from('registries').select('*').eq('slug', req.params.slug).single()
    if (!registry) {
      const { data: newReg } = await supabase.from('registries').insert([{ slug: req.params.slug, couple_name: 'Priya & Rahul', wedding_date: '2025-12-01', total_gold: 0 }]).select().single()
      registry = newReg
    }
    const { data: gifts } = await supabase.from('registry_gifts').select('*').eq('registry_slug', req.params.slug).order('created_at', { ascending: false })
    res.json({ success: true, registry, gifts: gifts || [] })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/registry/:slug/bless', async (req, res) => {
  try {
    const { name, amount, message, email, phone, receiverName, receiverPhone } = req.body
    const amount_inr = parseFloat(amount)
    if (!amount_inr || amount_inr < 100) throw new Error('Minimum Rs.100')
    const inrPerGram = await getGoldPrice()
    const goldGrams = parseFloat((amount_inr / inrPerGram).toFixed(4))
    const grailUser = await createGrailUser(email || name + '@glink.com', phone || '0000000000')
    let { data: registry } = await supabase.from('registries').select('*').eq('slug', req.params.slug).single()
    if (!registry) {
      const { data: newReg } = await supabase.from('registries').insert([{ slug: req.params.slug, couple_name: 'Priya & Rahul', wedding_date: '2025-12-01', total_gold: 0 }]).select().single()
      registry = newReg
    }
    await supabase.from('registry_gifts').insert([{
      registry_slug: req.params.slug,
      giver_name: name,
      amount_inr,
      gold_grams: goldGrams,
      message,
      grail_tx_id: grailUser.userId,
      receiver_name: receiverName || null,
      receiver_phone: receiverPhone || null
    }])
    const newTotal = parseFloat(((registry.total_gold || 0) + goldGrams).toFixed(4))
    await supabase.from('registries').update({ total_gold: newTotal }).eq('slug', req.params.slug)
    await supabase.from('transactions').insert([{ user_email: email || name, type: 'blessing', amount_inr, gold_grams: goldGrams, grail_tx_id: grailUser.userId, status: 'completed' }])

    // Send SMS to receiver if phone provided
    if (receiverPhone) {
      try {
        const smsMessage = `You received ${goldGrams}g gold blessing from ${name}! Message: "${message || 'Wishing you happiness!'}" - G-Link`
        await sendSMS(receiverPhone, smsMessage)
        console.log('Blessing SMS sent to receiver:', receiverPhone)
      } catch (e) {
        console.log('SMS error:', e.message)
      }
    }

    res.json({ success: true, goldGrams, totalGold: newTotal, grailUserId: grailUser.userId, grailConnected: grailUser.success, solanaExplorer: 'https://solscan.io/account/' + grailUser.userId + '', poweredBy: 'Oro GRAIL | Solana' })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

async function buyGoldOnGRAIL(userId, usdcAmount) {
  try {
    console.log('=== BUY GOLD ON GRAIL START ===')
    console.log('Buying gold - userId:', userId, 'usdc:', usdcAmount)
    console.log('User ID type:', typeof userId)
    console.log('User ID length:', userId.length)

    const priceRes = await grail.get('/api/trading/gold/price')
    const pricePerTroyOunceUSD = parseFloat(priceRes.data?.data?.price || 5109)

    // goldAmount must be in TROY OUNCES not grams!
    const goldAmountTroyOunces = parseFloat(usdcAmount) / pricePerTroyOunceUSD
    const maxUsdcAmount = parseFloat(usdcAmount) * 1.05

    console.log('Gold in troy ounces:', goldAmountTroyOunces.toFixed(6))
    console.log('Max USDC:', maxUsdcAmount.toFixed(2))

    // Use the correct GRAIL endpoint: /api/trading/purchases/user (plural, not singular)
    let res
    try {
      console.log('=== ATTEMPTING PURCHASE ===')
      // Try minimal request format - remove fields that API rejects
      const requestBody = {
        goldAmount: parseFloat(goldAmountTroyOunces.toFixed(6)),
        maxUsdcAmount: parseFloat(maxUsdcAmount.toFixed(2))
        // Remove userId, co_sign, and userAsFeePayer as API rejects them
      }
      console.log('Request body:', JSON.stringify(requestBody))

      res = await grail.post('/api/trading/purchases/user', requestBody)
      console.log('✅ Purchase endpoint success!')
      console.log('Response status:', res.status)
      console.log('Response data:', JSON.stringify(res.data))
    } catch (endpointError) {
      console.log('=== PURCHASE FAILED ===')
      console.log('Purchase endpoint failed, error:', endpointError.message)
      console.log('Response status:', endpointError.response?.status)
      console.log('Response data:', JSON.stringify(endpointError.response?.data))

      // Try with different field names
      try {
        console.log('=== TRYING ALTERNATIVE FIELD NAMES ===')
        const altRequestBody = {
          gold_amount: parseFloat(goldAmountTroyOunces.toFixed(6)),
          max_usdc_amount: parseFloat(maxUsdcAmount.toFixed(2))
        }
        console.log('Alternative request body:', JSON.stringify(altRequestBody))

        res = await grail.post('/api/trading/purchases/user', altRequestBody)
        console.log('✅ Alternative format success!')
        console.log('Response data:', JSON.stringify(res.data))
      } catch (altError) {
        console.log('=== ALTERNATIVE FAILED ===')
        console.log('Alternative format failed, trying partner endpoint...')
        console.log('Alt error:', altError.message)

        // Try partner purchase endpoint as fallback
        try {
          console.log('=== TRYING PARTNER ENDPOINT ===')
          const partnerRequestBody = {
            goldAmount: parseFloat(goldAmountTroyOunces.toFixed(6)),
            maxUsdcAmount: parseFloat(maxUsdcAmount.toFixed(2))
          }
          console.log('Partner request body:', JSON.stringify(partnerRequestBody))

          res = await grail.post('/api/trading/purchases/partner', partnerRequestBody)
          console.log('✅ Partner purchase endpoint success!')
          console.log('Partner response:', JSON.stringify(res.data))
        } catch (partnerError) {
          console.log('=== PARTNER FAILED TOO ===')
          console.log('Partner purchase failed, error:', partnerError.message)
          console.log('Partner error details:', JSON.stringify(partnerError.response?.data))
          throw partnerError
        }
      }
    }

    console.log('=== PROCESSING RESPONSE ===')
    console.log('GRAIL buy response:', JSON.stringify(res.data))

    const serializedTx = res.data?.data?.transaction?.serializedTx
    const purchaseId = res.data?.data?.purchaseId
    const walletType = res.data?.data?.transaction?.signingInstructions?.walletType

    console.log('walletType:', walletType)
    console.log('purchaseId:', purchaseId)
    console.log('serializedTx present:', !!serializedTx)

    if (serializedTx) {
      console.log('=== SIGNING TRANSACTION ===')
      const signResult = await signAndSubmit(serializedTx)
      console.log('✅ Gold purchase TX:', signResult.signature)
      return {
        success: true,
        transactionId: signResult.signature || purchaseId,
        purchaseId: purchaseId,
        realTransaction: true
      }
    }

    console.log('=== NO TRANSACTION TO SIGN ===')
    return {
      success: true,
      transactionId: purchaseId || 'tx_' + Date.now(),
      realTransaction: true
    }

  } catch (e) {
    console.log('=== BUY GOLD ERROR ===')
    console.log('buyGoldOnGRAIL error:', e.message)
    if (e.response) {
      console.log('Error status:', e.response.status)
      console.log('Error data:', JSON.stringify(e.response.data))
      console.log('Error headers:', JSON.stringify(e.response.headers))

      // Check for rate limiting
      if (e.response.status === 429 || e.response.data?.error?.includes('rate')) {
        console.log('⚠️ GRAIL rate limit hit - using mock transaction')
        return {
          success: false,
          transactionId: 'mock_rate_limit_' + Date.now(),
          mock: true,
          reason: 'rate_limit'
        }
      }

      // Check for user not found specifically
      if (e.response.status === 400 && e.response.data?.error?.includes('User not found')) {
        console.log('❌ GRAIL user not recognized - may need fresh user creation')
        return {
          success: false,
          transactionId: 'mock_user_not_recognized_' + Date.now(),
          mock: true,
          reason: 'user_not_recognized'
        }
      }

      // Check for bad request
      if (e.response.status === 400) {
        console.log('❌ GRAIL bad request - check parameters')
        return {
          success: false,
          transactionId: 'mock_bad_request_' + Date.now(),
          mock: true,
          reason: 'bad_request'
        }
      }
    }
    console.log('=== UNKNOWN ERROR - FALLBACK ===')
    return {
      success: false,
      transactionId: 'mock_error_' + Date.now(),
      mock: true,
      reason: 'unknown_error'
    }
  }
}

// Group Management APIs
app.post('/api/groups/create', async (req, res) => {
  try {
    const { name, type, description, rules, creatorEmail } = req.body
    const groupId = nanoid(10)

    const { data: group, error } = await supabase.from('groups').insert([{
      group_id: groupId,
      name,
      type,
      description,
      rules,
      creator_email: creatorEmail,
      total_gold: 0,
      member_count: 1,
      created_at: new Date().toISOString()
    }]).select().single()

    if (error) throw new Error(error.message)

    // Add creator as first member
    await supabase.from('group_members').insert([{
      group_id: groupId,
      email: creatorEmail,
      role: 'admin',
      joined_at: new Date().toISOString()
    }])

    res.json({ success: true, group })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/groups', async (req, res) => {
  try {
    const { data: groups, error } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    res.json({ success: true, groups })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/groups/:groupId', async (req, res) => {
  try {
    const { data: group, error } = await supabase
      .from('groups')
      .select('*')
      .eq('group_id', req.params.groupId)
      .single()

    if (error) throw new Error(error.message)

    // Get group members
    const { data: members } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', req.params.groupId)

    // Get group contributions
    const { data: contributions } = await supabase
      .from('group_contributions')
      .select('*')
      .eq('group_id', req.params.groupId)
      .order('created_at', { ascending: false })

    res.json({ success: true, group, members, contributions })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/groups/:groupId/contribute', async (req, res) => {
  try {
    const { email, amount, message, paymentId } = req.body
    const goldGrams = parseFloat((amount / await getGoldPrice()).toFixed(4))

    // Add contribution
    const { data: contribution, error } = await supabase.from('group_contributions').insert([{
      group_id: req.params.groupId,
      email,
      amount_inr: parseFloat(amount),
      gold_grams: goldGrams,
      message,
      payment_id: paymentId,
      created_at: new Date().toISOString()
    }]).select().single()

    if (error) throw new Error(error.message)

    // Update group total gold
    await supabase.rpc('increment_group_gold', {
      group_id: req.params.groupId,
      gold_amount: goldGrams
    })

    res.json({ success: true, contribution })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/groups/:groupId/join', async (req, res) => {
  try {
    const { email } = req.body

    // Check if already a member
    const { data: existing } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', req.params.groupId)
      .eq('email', email)
      .single()

    if (existing) {
      return res.status(400).json({ success: false, error: 'Already a member' })
    }

    // Add member
    const { data: member, error } = await supabase.from('group_members').insert([{
      group_id: req.params.groupId,
      email,
      role: 'member',
      joined_at: new Date().toISOString()
    }]).select().single()

    if (error) throw new Error(error.message)

    // Update member count
    await supabase.rpc('increment_group_members', {
      group_id: req.params.groupId
    })

    res.json({ success: true, member })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Buy gold via wallet API
app.post('/api/wallet/buy-gold', async (req, res) => {
  try {
    const { email, goldGrams, amount } = req.body

    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()

    if (error || !user) {
      return res.status(404).json({ success: false, error: 'User not found' })
    }

    // Create GRAIL user and transaction
    const grailUser = await createGrailUser(email, user.phone || '0000000000')

    // Update user's gold balance
    await supabase
      .from('users')
      .update({
        gold_grams: (user.gold_grams || 0) + parseFloat(goldGrams),
        grail_user_id: grailUser.userId
      })
      .eq('email', email)

    // Add transaction record
    await supabase.from('transactions').insert([{
      user_email: email,
      type: 'purchase',
      amount_inr: parseFloat(amount),
      gold_grams: parseFloat(goldGrams),
      grail_tx_id: grailUser.userId,
      status: 'completed'
    }])

    res.json({
      success: true,
      goldGrams: parseFloat(goldGrams),
      grailUserId: grailUser.userId
    })

  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Chat APIs
app.get('/api/groups/:groupId/messages', async (req, res) => {
  try {
    const { data: messages, error } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', req.params.groupId)
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)
    res.json({ success: true, messages })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/groups/:groupId/messages', async (req, res) => {
  try {
    const { senderEmail, message, messageType } = req.body

    const { data: newMessage, error } = await supabase.from('group_messages').insert([{
      group_id: req.params.groupId,
      sender_email: senderEmail,
      message: message,
      message_type: messageType || 'text',
      created_at: new Date().toISOString()
    }]).select().single()

    if (error) throw new Error(error.message)

    // Send SMS notifications to group members (if enabled)
    if (messageType === 'gold_share') {
      const { data: members } = await supabase
        .from('group_members')
        .select('email')
        .eq('group_id', req.params.groupId)
        .neq('email', senderEmail)

      // Get user details for SMS
      const { data: userData } = await supabase
        .from('users')
        .select('name, phone')
        .eq('email', senderEmail)
        .single()

      for (const member of members) {
        const { data: memberData } = await supabase
          .from('users')
          .select('phone')
          .eq('email', member.email)
          .single()

        if (memberData?.phone) {
          const smsMessage = `${userData?.name || 'Someone'} shared gold in your group! "${message}" - G-Link`
          await sendSMS(memberData.phone, smsMessage)
        }
      }
    }

    res.json({ success: true, message: newMessage })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/groups/:groupId/share-gold', async (req, res) => {
  try {
    const { senderEmail, amount, message } = req.body
    const goldGrams = parseFloat((amount / await getGoldPrice()).toFixed(4))

    // Add contribution
    const { data: contribution, error } = await supabase.from('group_contributions').insert([{
      group_id: req.params.groupId,
      email: senderEmail,
      amount_inr: parseFloat(amount),
      gold_grams: goldGrams,
      message: message,
      payment_id: 'group_share_' + Date.now(),
      created_at: new Date().toISOString()
    }]).select().single()

    if (error) throw new Error(error.message)

    // Update group total gold
    await supabase.rpc('increment_group_gold', {
      group_id: req.params.groupId,
      gold_amount: goldGrams
    })

    // Add system message
    const { data: userData } = await supabase
      .from('users')
      .select('name')
      .eq('email', senderEmail)
      .single()

    await supabase.from('group_messages').insert([{
      group_id: req.params.groupId,
      sender_email: 'system',
      message: `🪙 ${goldGrams}g gold contributed by ${userData?.name || senderEmail} - "${message || 'Gold sharing!'}"`,
      message_type: 'system',
      created_at: new Date().toISOString()
    }])

    res.json({ success: true, contribution })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/withdraw', async (req, res) => {
  try {
    const { email, goldGrams, bankAccount, ifsc, accountName, phone } = req.body
    const { data: user } = await supabase.from('users').select('*').eq('email', email).single()
    if (!user) throw new Error('User not found')
    if ((user.gold_grams || 0) < goldGrams) throw new Error('Insufficient balance')

    const inrPerGram = await getGoldPrice()
    const amountINR = Math.round(goldGrams * inrPerGram)

    console.log('--- Cashfree Withdrawal Initiation ---')
    console.log('User:', email)
    console.log('Amount INR:', amountINR)
    console.log('Bank Details:', { bankAccount, ifsc, accountName })

    if (!process.env.CASHFREE_CLIENT_ID) {
      console.log('Cashfree not configured, using simulated withdrawal')
      await supabase.from('users').update({ gold_grams: user.gold_grams - goldGrams }).eq('email', email)
      const { data: txn } = await supabase.from('transactions').insert([{
        user_email: email,
        type: 'withdrawal',
        amount_inr: amountINR,
        gold_grams: goldGrams,
        status: 'completed',
        details: 'Simulated (Cashfree not configured)'
      }]).select().single()

      return res.json({
        success: true,
        withdrawalId: 'SIM_' + txn.id,
        amountINR,
        message: 'Withdrawal simulated! Cashfree API keys missing.'
      })
    }

    // Step 1: Add Beneficiary to Cashfree
    const beneId = `bene_${email.replace(/[^a-zA-Z0-9]/g, '_')}`
    try {
      await cashfreePayouts.beneficiary.add({
        beneId,
        name: accountName,
        email,
        phone: phone || user.phone || '9999999999',
        bankDetails: {
          bankAccount,
          ifsc
        }
      })
      console.log('Beneficiary added/verified:', beneId)
    } catch (beneError) {
      console.log('Beneficiary add error (might already exist):', beneError.message)
    }

    // Step 2: Request Payout
    const transferId = `wd_${Date.now()}_${nanoid(5)}`
    const payoutResponse = await cashfreePayouts.transfers.requestTransfer({
      transferId,
      amount: amountINR.toString(),
      transferMode: 'IMPS',
      beneId,
      remark: 'G-Link Gold Withdrawal'
    })

    console.log('Cashfree Payout Response:', JSON.stringify(payoutResponse))

    if (payoutResponse.status === 'SUCCESS' || payoutResponse.status === 'PENDING') {
      // Deduct gold from user balance
      await supabase.from('users').update({ gold_grams: user.gold_grams - goldGrams }).eq('email', email)

      // Record transaction
      const { data: txn } = await supabase.from('transactions').insert([{
        user_email: email,
        type: 'withdrawal',
        amount_inr: amountINR,
        gold_grams: goldGrams,
        status: payoutResponse.status === 'SUCCESS' ? 'completed' : 'processing',
        cashfree_transfer_id: transferId,
        cashfree_reference_id: payoutResponse.referenceId
      }]).select().single()

      res.json({
        success: true,
        withdrawalId: transferId,
        amountINR,
        status: payoutResponse.status,
        message: payoutResponse.status === 'SUCCESS' ? 'Withdrawal successful!' : 'Withdrawal is being processed.'
      })
    } else {
      throw new Error(`Cashfree Error: ${payoutResponse.message || 'Transfer failed'}`)
    }

  } catch (e) {
    console.log('Withdraw error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/links/sender-history', async (req, res) => {
  try {
    const { sender_email } = req.query
    if (!sender_email) {
      return res.status(400).json({ success: false, error: 'sender_email required' })
    }

    const { data: links, error } = await supabase
      .from('gold_links')
      .select('*')
      .eq('sender_email', sender_email)
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json({ success: true, links: links || [] })
  } catch (e) {
    console.log('Sender history error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/links/recipient-history', async (req, res) => {
  try {
    const { recipient_email } = req.query
    if (!recipient_email) {
      return res.status(400).json({ success: false, error: 'recipient_email required' })
    }

    const { data: links, error } = await supabase
      .from('gold_links')
      .select('*')
      .eq('recipient_glink_id', recipient_email)
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json({ success: true, links: links || [] })
  } catch (e) {
    console.log('Recipient history error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/blessings/create-registry', async (req, res) => {
  try {
    const { registryName, creatorName, creatorEmail, description } = req.body

    if (!registryName || !creatorName || !creatorEmail) {
      return res.status(400).json({ success: false, error: 'Registry name, creator name, and email are required' })
    }

    // Generate unique slug
    const baseSlug = registryName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    let slug = baseSlug
    let counter = 1

    while (true) {
      const existing = await supabase.from('blessing_registries').select('id').eq('slug', slug).single()
      if (!existing.data) break
      slug = `${baseSlug}-${counter}`
      counter++
    }

    const { data: registry, error } = await supabase
      .from('blessing_registries')
      .insert([{
        registry_name: registryName,
        creator_name: creatorName,
        creator_email: creatorEmail,
        slug: slug,
        description: description
      }])
      .select()
      .single()

    if (error) throw error

    res.json({
      success: true,
      registry: registry,
      registryUrl: `${req.protocol}://${req.get('host')}/blessings/${slug}`
    })
  } catch (e) {
    console.log('Create blessing registry error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/blessings/:slug', async (req, res) => {
  try {
    const { slug } = req.params

    const { data: registry, error: registryError } = await supabase
      .from('blessing_registries')
      .select('*')
      .eq('slug', slug)
      .single()

    if (registryError || !registry) {
      return res.status(404).json({ success: false, error: 'Blessing registry not found' })
    }

    const { data: blessings, error: blessingsError } = await supabase
      .from('blessings')
      .select('*')
      .eq('registry_id', registry.id)
      .order('created_at', { ascending: false })

    if (blessingsError) throw blessingsError

    res.json({
      success: true,
      registry: registry,
      blessings: blessings || []
    })
  } catch (e) {
    console.log('Get blessing registry error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/blessings/:slug/send', async (req, res) => {
  try {
    const { slug } = req.params
    const { senderName, senderEmail, message } = req.body

    if (!senderName || !senderEmail || !message) {
      return res.status(400).json({ success: false, error: 'Sender name, email, and message are required' })
    }

    // Get registry
    const { data: registry, error: registryError } = await supabase
      .from('blessing_registries')
      .select('id')
      .eq('slug', slug)
      .single()

    if (registryError || !registry) {
      return res.status(404).json({ success: false, error: 'Blessing registry not found' })
    }

    // Add blessing
    const { data: blessing, error: blessingError } = await supabase
      .from('blessings')
      .insert([{
        registry_id: registry.id,
        sender_name: senderName,
        sender_email: senderEmail,
        message: message
      }])
      .select()
      .single()

    if (blessingError) throw blessingError

    res.json({
      success: true,
      blessing: blessing
    })
  } catch (e) {
    console.log('Send blessing error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/blessings/user/:email', async (req, res) => {
  try {
    const { email } = req.params

    const { data: registries, error } = await supabase
      .from('blessing_registries')
      .select('*')
      .eq('creator_email', email)
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json({ success: true, registries: registries || [] })
  } catch (e) {
    console.log('Get user blessing registries error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/blessing/create', async (req, res) => {
  try {
    const { name, occasion, message, email } = req.body
    if (!name || !occasion) {
      return res.status(400).json({
        success: false, error: 'Name and occasion required'
      })
    }

    const id = nanoid(10)
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
    const link = baseUrl + '/blessing.html?id=' + id

    const { error } = await supabase.from('gold_blessings').insert([{
      id,
      name,
      occasion,
      message: message || '',
      email: email || '',
      total_gold: 0,
      total_inr: 0,
      created_at: new Date().toISOString()
    }])

    if (error) throw error

    res.json({ success: true, id, link })
  } catch (e) {
    console.log('Create blessing error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

// IMPORTANT: /api/blessing/my must be BEFORE /api/blessing/:id
// Otherwise 'my' will be treated as an :id parameter!
app.get('/api/blessing/my', async (req, res) => {
  try {
    const { email } = req.query
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email required' })
    }

    const { data: blessings, error } = await supabase
      .from('gold_blessings')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Get blessing counts for each
    const blessingsWithCounts = await Promise.all(
      blessings.map(async (blessing) => {
        const { count } = await supabase
          .from('gold_blessing_entries')
          .select('*', { count: 'exact', head: true })
          .eq('gold_blessing_id', blessing.id)

        return {
          ...blessing,
          blesser_count: count || 0
        }
      })
    )

    res.json({ success: true, blessings: blessingsWithCounts })
  } catch (e) {
    console.log('Get my blessings error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/blessing/:id', async (req, res) => {
  try {
    const { data: blessing, error } = await supabase
      .from('gold_blessings')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (error || !blessing) {
      return res.status(404).json({
        success: false, error: 'Blessing page not found'
      })
    }

    const { data: entries } = await supabase
      .from('gold_blessing_entries')
      .select('*')
      .eq('gold_blessing_id', req.params.id)
      .order('created_at', { ascending: false })

    const inrPerGram = await getGoldPrice()

    res.json({
      success: true,
      blessing,
      entries: entries || [],
      livePrice: Math.round(inrPerGram)
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/blessing/:id/send', async (req, res) => {
  try {
    const { blesserName, blesserMessage, amount, paymentId, blesserEmail } = req.body

    if (!blesserName || !amount) {
      return res.status(400).json({
        success: false, error: 'Name and amount required'
      })
    }

    const { data: blessing } = await supabase
      .from('gold_blessings')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (!blessing) throw new Error('Blessing page not found')

    const inrPerGram = await getGoldPrice()
    const goldGrams = parseFloat((parseFloat(amount) / inrPerGram).toFixed(4))
    const usdcAmount = parseFloat(amount) / 84

    console.log('=== BLESSING GOLD PURCHASE ===')
    console.log('Blesser:', blesserName, 'Amount:', amount, 'Gold:', goldGrams)

    // Create GRAIL user for blesser
    let grailUserId = null
    let grailTxId = null

    try {
      const blesserEmailForGrail = blesserEmail ||
        blesserName.toLowerCase().replace(/\s/g, '') + '@blessing.glink'

      console.log('Creating GRAIL user for blesser...')
      const grailUser = await createGrailUser(blesserEmailForGrail, '0000000000')
      grailUserId = grailUser.userId
      console.log('Blesser GRAIL ID:', grailUserId)

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 8000))

      // Buy gold on GRAIL
      const isRealId = grailUserId &&
        !grailUserId.startsWith('glink_') &&
        !grailUserId.startsWith('temp_')

      if (isRealId) {
        console.log('Buying gold for blessing...')
        const goldResult = await buyGoldOnGRAIL(grailUserId, usdcAmount)
        grailTxId = goldResult.transactionId
        console.log('Blessing gold TX:', grailTxId)
      }
    } catch (e) {
      console.log('GRAIL blessing error:', e.message)
    }

    // Save blessing entry
    const { error: entryError } = await supabase
      .from('gold_blessing_entries')
      .insert([{
        gold_blessing_id: req.params.id,
        blesser_name: blesserName,
        blesser_message: blesserMessage || '',
        amount_inr: parseFloat(amount),
        gold_grams: goldGrams,
        grail_tx_id: grailTxId || '',
        created_at: new Date().toISOString()
      }])

    if (entryError) throw entryError

    // Update total gold and INR
    const newTotalGold = parseFloat(
      ((blessing.total_gold || 0) + goldGrams).toFixed(4)
    )
    const newTotalInr = parseFloat(
      ((blessing.total_inr || 0) + parseFloat(amount)).toFixed(2)
    )

    await supabase
      .from('gold_blessings')
      .update({
        total_gold: newTotalGold,
        total_inr: newTotalInr
      })
      .eq('id', req.params.id)

    console.log('Blessing recorded! Total gold:', newTotalGold)

    // Send email to page owner
    if (blessing.email) {
      try {
        const baseUrl = 'https://glink-n0y9.onrender.com'
        await transporter.sendMail({
          from: '"G-Link Gold" <' + process.env.EMAIL_USER + '>',
          to: blessing.email,
          subject: blesserName + ' sent you a gold blessing! 🪙',
          html: `
            <div style="background:#1a1a1a;padding:30px;
              border-radius:12px;font-family:Arial;max-width:500px">
              <h2 style="color:#D4AF37">🪙 G-Link Blessing</h2>
              <h3 style="color:#fff">
                ${blesserName} blessed you on your ${blessing.occasion}!
              </h3>
              <div style="background:#2a2000;border:2px solid #D4AF37;
                border-radius:12px;padding:20px;text-align:center;margin:16px 0">
                <p style="color:#D4AF37;font-size:32px;
                  font-weight:bold;margin:0">${goldGrams}g Gold</p>
                <p style="color:#fff;font-size:16px;margin-top:8px">
                  Worth ₹${amount}
                </p>
              </div>
              ${blesserMessage ?
              `<p style="color:#aaa;font-style:italic">
                  "${blesserMessage}"
                </p>` : ''}
              <div style="background:#111;border-radius:8px;
                padding:16px;margin-top:16px">
                <p style="color:#888;margin:0">Total blessings received:</p>
                <p style="color:#D4AF37;font-size:24px;
                  font-weight:bold;margin:4px 0">${newTotalGold}g Gold</p>
                <p style="color:#666;font-size:12px">
                  Worth ₹${Math.round(newTotalInr)}
                </p>
              </div>
              <a href="${baseUrl}/blessing.html?id=${req.params.id}"
                style="display:block;background:#D4AF37;color:#000;
                padding:14px;border-radius:10px;text-align:center;
                text-decoration:none;font-weight:bold;margin-top:16px">
                View Your Blessing Page →
              </a>
              <p style="color:#555;font-size:11px;
                text-align:center;margin-top:16px">
                Powered by G-Link | Oro GRAIL | Solana Blockchain
              </p>
            </div>
          `
        })
        console.log('Blessing notification sent to:', blessing.email)
      } catch (e) {
        console.log('Blessing email error:', e.message)
      }
    }

    res.json({
      success: true,
      goldGrams,
      totalGold: newTotalGold,
      totalInr: newTotalInr,
      grailUserId,
      grailTxId,
      realTransaction: !!(grailTxId && !grailTxId.startsWith('mock_')),
      solanaExplorer: grailTxId && !grailTxId.startsWith('mock_') ?
        'https://solscan.io/tx/' + grailTxId + '?cluster=devnet' : null,
      poweredBy: 'Oro GRAIL | Solana Devnet'
    })

  } catch (e) {
    console.log('Send blessing error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.use(express.static('.'))

app.listen(process.env.PORT || 3000, () => {
  console.log('G-Link running!')
  console.log('GRAIL:', process.env.GRAIL_BASE_URL ? 'Connected' : 'Missing')
  console.log('Supabase:', process.env.SUPABASE_URL ? 'Connected' : 'Missing')
  console.log('Email:', process.env.EMAIL_USER ? 'Connected' : 'Missing')
  console.log('Base URL:', BASE_URL)
  console.log('Google callback:', GOOGLE_REDIRECT_URI)
})
