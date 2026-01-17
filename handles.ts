import { AtpAgent } from 'npm:@atproto/api'
import { Jetstream } from 'npm:@skyware/jetstream'
import type { AtpSessionData, AtpSessionEvent } from 'npm:@atproto/api'

const DOMAINS = [
	'.hasa.gripe',
	'.is.vgay.fyi',
	'.doeswet.work',
	'.is.tgirl.mom',
	'.has.tgirl.mom',
	'.on.tgirl.quest',
	'.is.tgirlat.work',
	'.wants.tgirl.mom',
	'.winning.tgirl.quest',
	'.failing.tgirl.quest',
]
const REMOVE_SECRET = await Deno.readTextFile('./credentials/handles.remove.key')

const getMention = (data: { commit: { record: { facets: { features: { '$type': string, did: string }[] }[] } } }): any | null => {
	let mention = null
	for (let facet of data.commit.record.facets) {
		if (mention) continue
		for (let feature of facet.features) {
			if (mention) continue
			if (feature['$type'] !== 'app.bsky.richtext.facet#mention') return
			if (feature.did !== 'did:plc:4vrriezpgc4t6y5sf7lcilhv') return
			mention = facet
		}
	}
	return mention
}
const removeMention = (data: { commit: { record: { text: string } } }, mention: { index: { byteStart: number; byteEnd: number } }): string =>
	`${data.commit.record.text.slice(0, mention.index.byteStart)}${data.commit.record.text.slice(mention.index.byteEnd)}`.trim()
function parseUri(uri: string): { repo: string, collection: string, rkey: string } {
  const [, , repo, collection, rkey] = uri.split("/")
  return { repo, collection, rkey }
}

const credential = JSON.parse(await Deno.readTextFile('./credentials/handles.json'))
const sessionData = JSON.parse(await Deno.readTextFile('./credentials/handles.session.json') ?? '{}')
const agent = new AtpAgent({
	service: 'https://at.queerlil.tools',
	persistSession: async (_event: AtpSessionEvent, session?: AtpSessionData) => {
		if (session) await Deno.writeTextFile('./credentials/handles.session.json', JSON.stringify(session))
	}
})

let session = await agent.resumeSession(sessionData)
if (!session || !session.success) session = await agent.login(credential)
if (!session || !session.success) throw new Error('no agent session could be established')
const repo = agent.sessionManager.session.did
type PostRef = { uri: string, cid: string }
const getReplyRefs = async (data: { did: string, commit: { rkey: string } }): Promise<{ root: PostRef, parent: PostRef }> => {
  const parentResp = await agent.com.atproto.repo.getRecord({ repo: data.did, collection: 'app.bsky.feed.post', rkey: data.commit.rkey })
  const parent = parentResp.data

  const parentReply = parent.value.reply as { root: { uri: string } } | undefined
  let root = parent
  if (parentReply) {
    const rootUriParts = parseUri(parentReply.root.uri)
    const rootResp = await agent.com.atproto.repo.getRecord(rootUriParts)
    root = rootResp.data
  }

  return { root: { uri: root.uri, cid: root.cid }, parent: { uri: parent.uri, cid: parent.cid } }
}
const sendPost = async (text: string, parentData: any) => await agent.app.bsky.feed.post.create({ repo }, {
	text, reply: await getReplyRefs(parentData), createdAt: new Date().toISOString()
})

const ws = new WebSocket('wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post')

ws.onmessage = async event => {
	if (!event.data || event.data === '') return
	const data = JSON.parse(event.data)
	if (!data.commit) return
	if (data.commit.collection !== 'app.bsky.feed.post') return
	if (!data.commit.record) return
	if (!data.commit.record.facets) return
	const mention = getMention(data)
	if (!mention) return
	const message = removeMention(data, mention)
	const parts = message.split(' ')
	const command = parts[0]
	let handle = parts[1]
	const handleIsHandle = handle?.startsWith('@')
	handle = handleIsHandle ? handle.substring(1) : 'handle.invalid'
	console.log({ command, message })
	const changeUri = `https://cgi.queerlil.tools/bsky-handle.ps1?domain=${handle}&did=${encodeURIComponent(data.did)}`
	switch (command) {
		case 'domains':
			await sendPost(`The following domains are available: \n- ${DOMAINS.join('\n- ')}`, data)
			break
		case 'list':
			const handles = JSON.parse(await Deno.readTextFile('/tmp/handles_records.json'))
			const userHandles = handles.filter(i => Object.values(i)[0] === data.did).map(i => Object.keys(i)[0])
			console.log("User handle list", userHandles)
			if (!userHandles.length) await sendPost('You have no custom handles yet.', data)
			else await sendPost(`You have the following handles associated with your account: \n- @${userHandles.join('\n- @')}`, data)
			break
		case 'add':
			if (!handleIsHandle) {
				await sendPost(`The provided input is not a @handle: ${handle}`, data)
				break
			}
			console.log("User handle add", parts)
			const handleAddResp = await fetch(changeUri)
			console.log("User handle add", handleAddResp)
			if (handleAddResp.status !== 200 && handleAddResp.status !== 201) await sendPost(`Something went wrong when trying to add @${handle} to '${data.did}': ${handleAddResp.status} - ${await handleAddResp.text()}`, data)
			else await sendPost(`Succesfully added @${handle} to '${data.did}'!`, data) 
			break
		case 'remove':
			console.log("User handle remove", parts)
			const handleRemoveResp = await fetch(`${changeUri}&remove=${REMOVE_SECRET}`)
			console.log("User handle remove", handleRemoveResp)
			if (handleRemoveResp.status !== 201) {
				if (!handleRemoveResp.ok) await sendPost(`Something went wrong when trying to remove @${handle} from '${data.did}': ${handleRemoveResp.status} - ${await handleRemoveResp.text()}`, data)
				else await sendPost(`Removed @${handle} from '${data.did}'`, data) 
			} else await sendPost(`Removed @${handle} from '${data.did}'`, data) 
			break
		case 'page':
			console.log("User page general", parts)
			const subcommand = parts[1]
			switch (subcommand) {
				case 'domain':
					const newDomain = parts[2]
					if (!newDomain) {
						try {
							const { data: { value: { domain } } } = await agent.com.atproto.repo.getRecord({ repo, collection: 'tools.queerlil.handles.domain', rkey: data.did })
							await sendPost(`Your primary domain is 'https://${domain}'`, data)
						} catch {
							await sendPost("You don't have a primary domain set. Try 'page domain yourname.is.vgay.fyi' or 'domains' to view a list of available qTLDs.", data)
						}
						break
					}

					await agent.com.atproto.repo.putRecord({ repo, collection: 'tools.queerlil.handles.domain', rkey: data.did, record: { '$type': 'tools.queerlil.handles.domain', domain: newDomain, createdAt: new Date().toISOString() } })
					await sendPost(`Your primary domain has been set to 'https://${newDomain}'.`, data)
					break
				case 'set':
					const href = data.commit.record?.embed?.external?.uri
					if (!/^(https:\/\/)?gist.githubusercontent.com/.test(href)) {
						await sendPost('That page URI is invalid. It must be hosted on gist.githubusercontent.com', data)
						break
					}
					let fileName = parts[3]
					if (!fileName) fileName = 'index'
					const { data: { value: { domain } } } = await agent.com.atproto.repo.getRecord({ repo, collection: 'tools.queerlil.handles.domain', rkey: data.did })
					const rkey = `${domain.split('.').reverse().join('.')}.${fileName}`
					await agent.com.atproto.repo.putRecord({ repo, collection: 'tools.queerlil.handles.page', rkey, record: { '$type': 'tools.queerlil.handles.page', href, createdAt: new Date().toISOString() } })
					await sendPost(`Your page https://${domain}/${fileName.replace('__', '.')} is now ready.`, data)
					break
				default:
					console.warn("invalid page command", data, { command, parts })
					break
			}
			
			break
		default:
			console.warn("invalid command", data, { command, parts })
			break
	}
}

ws.onopen = event => console.log("Connected to the server")
ws.onerror = event => console.error("WebSocket error observed:", event)
ws.onclose = event => console.log(`WebSocket closed: Code=${event.code}, Reason=${event.reason}`)
