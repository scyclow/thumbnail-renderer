import * as dotenv from 'dotenv'

import ethers  from 'ethers'
import cors  from 'cors'
import express  from 'express'
import logger  from 'morgan'
import puppeteer  from 'puppeteer'
import fetch from 'node-fetch'

import { NFTStorage, File }  from 'nft.storage'
import mime from 'mime'

dotenv.config()

const config = {
  SCRIPT_CONTRACT_ADDR: '0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270', // ArtBlocks Contract
  PORT: process.env.PORT || 5555,
  ENV: process.env.ENV || 'dev',
  IPFS_GATEWAY: process.env.IPFS_GATEWAY || 'https://ipfs.io/ipfs',
  NFT_STORAGE_KEY: process.env.NFT_STORAGE_KEY,
  INFURA_KEY: process.env.INFURA_KEY,
  SELECTOR: process.env.SELECTOR || 'test',
  THUMBNAIL_WIDTH: process.env.THUMBNAIL_WIDTH || 2700,
  THUMBNAIL_HEIGHT: process.env.THUMBNAIL_HEIGHT || 2700,
}


const renderArgs = {
  width: 2700,
  height: 2700,
  selector: 'test',
}


const scriptContractABI = [
  'function tokenIdToHash(uint256 tokenId) view returns (bytes32 hash)',
  'function projectScriptByIndex(uint256 projectId, uint256 index) view returns (string script)',
  'function projectScriptInfo(uint256 projectId) view returns (string memory scriptJSON, uint256 scriptCount, bool useHashString, string memory ipfsHash, bool locked, bool paused)',
]


async function generateHtmlContent(contract, tokenId) {
  const url = `https://mainnet.infura.io/v3/${config.INFURA_KEY}`
  const provider = new ethers.providers.JsonRpcProvider(url)

  const throwawayPrivateKeyThatsOnlyUsedForGetters = "0x0123456789012345678901234567890123456789012345678901234567890123";
  const signer = new ethers.Wallet(throwawayPrivateKeyThatsOnlyUsedForGetters, provider)

  const ArtBlocksContract = new ethers.Contract(contract, scriptContractABI, provider)

  const projectId = Math.floor(tokenId/1000000)

  const hash = await ArtBlocksContract.connect(signer).tokenIdToHash(tokenId)
  const projectScriptInfo = await ArtBlocksContract.connect(signer).projectScriptInfo(projectId)
  const scriptCount = projectScriptInfo.scriptCount.toNumber()

  let projectScript = ''

  for (let i = 0; i < scriptCount; i++) {
    projectScript += await ArtBlocksContract.connect(signer).projectScriptByIndex(projectId, i)
  }


  return `
    <html>
      <body id="${config.SELECTOR}"></body>
      <script src="https://cdn.jsdelivr.net/npm/p5@1.2.0/lib/p5.js"></script>
      <script>window.tokenData = { hash: "${hash}", tokenId: ${tokenId} }</script>
      <script>${projectScript}</script>
    </html>
  `
}


async function generateImage(htmlContent) {
  try {
    const start = Date.now()
    const browser = await puppeteer.launch()
    const page = await browser.newPage()
    await page.setViewport({ width: config.THUMBNAIL_WIDTH, height: config.THUMBNAIL_HEIGHT })
    await page.setContent(htmlContent)
    await page.waitForSelector('#' + config.SELECTOR)
    const element = await page.$('#' + config.SELECTOR)
    const image = await element.screenshot()
    await browser.close()
    return image
  } catch (e) {
    throw new Error(e)
  }
}

// function pinToIPFS() {
//   const options = {
//     host: 'ipfs.infura.io',
//     port: 5001,
//     path: '/api/v0/pin/add?arg=QmeGAVddnBSnKc1DLE7DLV9uuTqo5F7QbaveTjr45JUdQn',
//     method: 'POST',
//     auth: `${config.IPFS_PROJECT_ID}:${config.IPFS_PROJECT_SECRET}`,
//   }
// }

async function nftStorageUpload(image) {
  const file = new File([image], 'testfile', { type: 'image/png'})
  console.log(file)

  const nftstorage = new NFTStorage({ token: config.NFT_STORAGE_KEY })

  // call client.store, passing in the image & metadata
  return nftstorage.store({
    image: file,
    name: 'testfile',
    description: 'this is a test',
  })
}


const cache = {
  __cache: {},
  async get(tokenId) {
    return this.__cache[tokenId]
  },
  async set(tokenId, cid) {
    return this.__cache[tokenId] = cid
  }
}



const app = express()
app.use(cors())
app.use(logger(
  '[:date[web]] :method :url :status :response-time ms - :res[content-length]',
  { skip: (req, res) => req.originalUrl === '/favicon.ico' }
))


app.get('/health', async (req, res) => {
  res.send('ok')
})

app.get('/render/:tokenId', async (req, res) => {
  const { tokenId } = req.params
  try {
    const cachedCID = await cache.get(tokenId)
    if (cachedCID) {
      const ipfsImage = await fetch(`${config.IPFS_GATEWAY}/${cachedCID}`)

      console.log('return cached')

      res.set('Content-Type', 'image/png')
      ipfsImage.body.pipe(res)
    } else {
      const htmlContent = await generateHtmlContent(config.SCRIPT_CONTRACT_ADDR, tokenId)
      const image = await generateImage(htmlContent)
      const { ipnft } = await nftStorageUpload(image)
      const ipfsResponse = await fetch(`${config.IPFS_GATEWAY}/${ipnft}/metadata.json`)
      const responseJSON = await ipfsResponse.json()

      await cache.set(tokenId, responseJSON.image.replace('ipfs://', ''))

      console.log('return rendered')
      res.set('Content-Type', 'image/png')
      res.send(image)
    }
  } catch (e) {
    throw new Error(e)
  }
})

app.listen(config.PORT, (err) => {
  if (err) throw new Error(`Something went wrong with express: ${err.message}`);
  console.log('Server started', new Date());
  console.log(`Running on src port ${config.PORT}`)
  console.log(`Running NODE_ENV: ${config.ENV}`);
})


