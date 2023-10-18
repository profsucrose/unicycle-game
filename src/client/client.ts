import './style.css'

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils'
import { degToRad, inverseLerp, lerp, radToDeg } from 'three/src/math/MathUtils'
import { io, Socket } from 'socket.io-client'
import { ClientToServerEvents, Player, ServerToClientEvents } from '../shared/events'
import { FigureEight, InitClient, Leaderboard, Loop, PlayerVelocities, Pose, Track, TrackType, formatTime, trackTypeToTrack } from '../shared'
import FinishLine from './finishLine.png'

const USE_DEBUG_CAMERA = false

const params = new URL(window.location.href).searchParams

const host = params.get('host') ?? 'http://localhost'
const serverPort = params.get('port') ?? 8082

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(`${host}:${serverPort}`);

const FPS = 60
const tickDelta = 1 / FPS
const friction = 0.9

// TODO: Move to prototype
const xyz = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z]

const positionText = document.createElement('pre')
Object.assign(positionText.style, {
    position: 'absolute',
    left: '10px',
    top: '10px',
    color: 'white',
    fontFamily: 'monospace',
    userSelect: 'none'
})
positionText.innerText = 'Test'
// document.body.appendChild(positionText)

const leaderboardTable = document.createElement('table')
Object.assign(leaderboardTable.style, {
    position: 'absolute',
    left: '10px',
    top: '10px',
    color: 'white',
    fontFamily: 'monospace',
    userSelect: 'none',
    textAlign: 'left',
})
leaderboardTable.innerHTML = `
    <style>td, th { padding: 0 30px 0 0; }</style>
    <tr>
        <th>Player</td>
        <th>Lap</th>
    </tr>
`
document.body.appendChild(leaderboardTable)

let leaderboardTrs: HTMLTableRowElement[] = []

function setLeaderboardRows(rows: Leaderboard) {
    leaderboardTrs.forEach(tr => tr.remove())    

    for (const { name, lapTime } of rows) {
        const tr = document.createElement('tr')

        const nameTd = document.createElement('td')
        nameTd.innerText = name
        tr.appendChild(nameTd)

        const lapTd = document.createElement('td')
        lapTd.innerText = formatTime(lapTime)
        tr.appendChild(lapTd)

        leaderboardTable.appendChild(tr)

        leaderboardTrs.push(tr)
    }
}

const logs = document.createElement('pre')
Object.assign(logs.style, {
    position: 'absolute',
    width: '400px',
    right: '0px',
    top: '10px',
    color: 'white',
    height: '200px',
    overflow: 'hidden',
    fontFamily: 'monospace',
    userSelect: 'none'
})
document.body.appendChild(logs)

const chatInput = document.createElement('input')
Object.assign(chatInput.style, {
    position: 'absolute',
    width: '200px',
    right: '195px',
    top: `${logs.clientHeight + 50}px`,
    overflow: 'hidden',
    fontFamily: 'monospace',
    userSelect: 'none'
})
document.body.appendChild(chatInput)


function log(line: string) {
    logs.innerText += '\n' + line
    logs.scroll(0, logs.scrollHeight + 100)
}

let timeSeconds = 0

const keysHeld = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    ShiftLeft: false,
    Space: false,
}

document.addEventListener('keydown', (event) => {
    if (event.code in keysHeld) (keysHeld as any)[event.code] = true
})

document.addEventListener('keyup', (event) => {
    if (event.code in keysHeld) (keysHeld as any)[event.code] = false
})

const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x))

let track: Track

class Unicycle {
    localMesh: THREE.Mesh
    worldMesh: THREE.Mesh

    localRiderMesh: THREE.Mesh
    localRiderOffsetY = 0.6

    // Use extremey simplified, hacky physics approximation
    dPitchMomentum: number = 0
    dRollMomentum: number = 0

    maxOmegaRadiansPerSecond: number = 3
    centerToBottomUnrotated: THREE.Vector3
    arrowHelper: THREE.ArrowHelper
    normalArrow: THREE.ArrowHelper
    centerArrow: THREE.ArrowHelper

    pitch: number = 0
    yaw: number = 0
    roll: number = 0

    curvatureRing: THREE.Mesh

    worldMeshRollMomentum = 0

    worldMeshRoll = 0
    worldMeshYaw = Math.PI

    riderRoll = 0

    heading: THREE.Vector3

    name: string = "Player 1"
    nameBillboard: THREE.Mesh

    scene: THREE.Scene

    roundTime = 0

    // TODO: Clean up basic kinematics
    yVelocity = 0

    leanSpeedDeg = 200

    updateName(newName: string) {
        this.name = newName
        if (this.nameBillboard) {
            this.scene.remove(this.nameBillboard)
        }
        this.setNameBillboard(newName)
    }

    setPosition(position: THREE.Vector3) {
        this.worldMesh.position.set(position.x, position.y, position.z)
    }

    setPose(pose: Pose) {
        this.worldMesh.position.set(pose.x, pose.y, pose.z)
        this.worldMeshRoll = pose.roll
        this.worldMeshYaw = pose.yaw
    }

    getPosition(): THREE.Vector3 {
        return this.worldMesh.position
    }

    getHeading(): THREE.Vector3 {
        return new THREE.Vector3(Math.sin(this.worldMeshYaw + Math.PI / 2), 0, Math.cos(this.worldMeshYaw + Math.PI / 2))
    }

    generateWheelMesh() {
        const wheelGeometry = (() => {
            const radius = 1
            const hubRadius = 0.2
            const nSpokes = 11
            const spokeRadius = 0.05
            const tubeRadius = 0.2
            const hubWidth = 0.15

            const torus = new THREE.TorusGeometry(radius, tubeRadius, 8, nSpokes - 1)

            const hub = new THREE.CylinderGeometry(hubRadius, hubRadius, hubWidth, 20, 10)
                .rotateX(Math.PI / 2)

            const spokes = Array.from({ length: nSpokes }, (_, i) => {
                const t = i / (nSpokes - 1)
                const theta = Math.PI / 2 + t * 2 * Math.PI
                const length = radius - 2 * tubeRadius
                return new THREE.CylinderGeometry(spokeRadius, spokeRadius, length, 5, 5)
                    .translate(0, hubRadius + length / 2, 0)
                    .rotateZ(theta)
            })

            return BufferGeometryUtils.mergeGeometries([torus, hub, ...spokes])
                .rotateZ((2 * Math.PI) / (nSpokes - 1))
        })()

        console.log(wheelGeometry.attributes.position.count)

        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: true,
        })

        const mesh = new THREE.Mesh(wheelGeometry, material)

        mesh.geometry.scale(0.5, 0.5, 0.5)
        mesh.geometry.computeBoundingBox()

        const size = new THREE.Vector3
        mesh.geometry.boundingBox.getSize(size)
        mesh.translateY(size.y / 2)

        this.centerToBottomUnrotated = new THREE.Vector3(0, -0.5 - 0.06, 0)

        return mesh
    }

    generateRiderMesh(wheelMesh: THREE.Mesh) {
        const riderRadius = 0.1
        const riderHeight = 2
        const geometry = new THREE.CylinderGeometry(riderRadius, riderRadius, riderHeight)
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000
        })
        const size = new THREE.Vector3()
        wheelMesh.geometry.computeBoundingBox()
        wheelMesh.geometry.boundingBox.getSize(size)
        const mesh = new THREE.Mesh(geometry, material)
            .translateY(size.y + riderHeight / 2 + this.localRiderOffsetY)
        return mesh
    }

    rotateRider(theta: number) {
        const oldPosition = this.localRiderMesh.position.clone()

        this.localRiderMesh.geometry.computeBoundingBox()
        const size = new THREE.Vector3
        this.localRiderMesh.geometry.boundingBox.getSize(size)

        // this.localRiderMesh.position.set(0, size.y, 0)

        this.riderRoll += theta
        this.localRiderMesh.rotateX(theta)
        const dx = Math.sin(theta) * size.y/2
        this.localRiderMesh.translateZ(dx)

        // this.localRiderMesh.position.set(oldPosition.x, oldPosition.y, oldPosition.z + dx)
    }

    handleInput() {
        if (keysHeld.KeyW) this.dPitchMomentum -= this.maxOmegaRadiansPerSecond * tickDelta
        if (keysHeld.KeyS) this.dPitchMomentum += this.maxOmegaRadiansPerSecond * tickDelta

        if (keysHeld.KeyD || keysHeld.KeyA) {
            const leanSpeedDeg = 200
            const theta = degToRad((keysHeld.KeyD ? leanSpeedDeg : 0) + (keysHeld.KeyA ? -leanSpeedDeg : 0)) * tickDelta
            this.rotateRider(theta)
        }

        if (keysHeld.ShiftLeft) {
            this.maxOmegaRadiansPerSecond = 6
        } else {
            this.maxOmegaRadiansPerSecond = 3
        }
    }    

    getVelocities(): PlayerVelocities {
        return {
            wheelPitch: this.dPitchMomentum
        }
    }

    setVelocities(velocities: PlayerVelocities) {
        this.dPitchMomentum = velocities.wheelPitch
    }

    reset() {
        this.worldMeshRoll = 0
        this.worldMeshRollMomentum = 0
        this.dPitchMomentum = 0
    }

    getPose(): Pose {
        return {
            x: this.worldMesh.position.x,
            y: this.worldMesh.position.y,
            z: this.worldMesh.position.z,
            yaw: this.worldMeshYaw,
            roll: this.worldMeshRoll
        }
    }

    update() {
        // TODO: Optimize heap allocations

        this.centerToBottomUnrotated.applyEuler(new THREE.Euler(this.roll, this.yaw, this.pitch))
        const contactPoint = this.localMesh.position.clone().add(this.centerToBottomUnrotated)

        this.pitch += this.dPitchMomentum * tickDelta
        this.roll += this.dRollMomentum * tickDelta

        const wheelMass = 5
        const wheelInertia = 70
        const gravity = 9.81
        const riderSize = new THREE.Vector3()
        const wheelMeshSize = new THREE.Vector3()
        this.localRiderMesh.geometry.computeBoundingBox()
        this.localRiderMesh.geometry.boundingBox.getSize(riderSize)
        this.localMesh.geometry.computeBoundingBox()
        this.localMesh.geometry.boundingBox.getSize(wheelMeshSize)
        const rX = (Math.sin(this.worldMeshRoll) * wheelMeshSize.y
            + Math.sin(this.localRiderMesh.rotation.x) * (riderSize.y / 2 + this.localRiderOffsetY))
        let torque = rX * gravity * wheelMass

        this.worldMeshRollMomentum += torque / wheelInertia * tickDelta

        if (Math.abs(this.worldMeshRoll) < Math.PI / 2) {
            this.worldMeshRoll += this.worldMeshRollMomentum * tickDelta
        }

        this.worldMesh.rotation.x = clamp(this.worldMesh.rotation.x, -Math.PI / 2, Math.PI / 2)

        const r = wheelMeshSize.x / 2
        const dx = this.dPitchMomentum * tickDelta * r

        this.dPitchMomentum += -dx * friction

        // const k = 1/inverseLerp(0, Math.PI/2, this.roll)

        const denom = lerp(0, 1, inverseLerp(0, Math.PI / 2, Math.abs(this.worldMeshRoll)))
        let k = Math.abs(denom) < 1e-6 ? Infinity : 1 / denom
        // k = 10

        this.heading = new THREE.Vector3(Math.sin(this.worldMeshYaw + Math.PI / 2), 0, Math.cos(this.worldMeshYaw + Math.PI / 2))
        this.arrowHelper.position.set(this.worldMesh.position.x, 0, this.worldMesh.position.z)
        this.arrowHelper.setDirection(this.heading)

        const speed = -this.dPitchMomentum

        this.worldMesh.position.add(this.heading.multiplyScalar(speed * tickDelta))

        this.worldMeshYaw -= Math.sign(this.worldMeshRoll) * speed / k * tickDelta
        this.worldMesh.rotation.set(0, 0, 0)
        this.worldMesh.rotateY(this.worldMeshYaw)
        this.worldMesh.rotateX(this.worldMeshRoll)

        // TODO: Switch from naive Euler angles to rotation vector

        this.worldMesh.position.y += this.yVelocity * tickDelta

        if (!track.onMap(...xyz(this.worldMesh.position))) {
            this.yVelocity -= gravity * tickDelta
        } else {
            this.yVelocity = 0
            this.worldMesh.position.y = 0
        }

        this.localMesh.setRotationFromEuler(new THREE.Euler(this.roll, this.yaw, this.pitch))

        this.nameBillboard.quaternion.copy(camera.quaternion)

        this.nameBillboard.position.set(this.worldMesh.position.x, this.worldMesh.position.y + 5, this.worldMesh.position.z)

        const fNum = (n: number) => n.toFixed(2).padStart(5, ' ')

        positionText.innerText = `Position: ${fNum(this.worldMesh.position.x)}, ${fNum(this.worldMesh.position.y)}, ${fNum(this.worldMesh.position.z)}`
    }

    updateBillboard() {

        this.nameBillboard.quaternion.copy(camera.quaternion)

        this.nameBillboard.position.set(this.worldMesh.position.x, this.worldMesh.position.y + 5, this.worldMesh.position.z)

    }

    constructor(scene: THREE.Scene, startingPose: Pose, name: string) {
        this.name = name
        this.localMesh = this.generateWheelMesh()

        this.localRiderMesh = this.generateRiderMesh(this.localMesh)

        this.worldMesh = new THREE.Mesh()
        this.worldMesh.add(this.localMesh)
        this.worldMesh.add(this.localRiderMesh)

        this.arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 1)
        scene.add(this.arrowHelper);

        this.centerArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 1)
        scene.add(this.centerArrow);

        this.centerArrow.setColor(THREE.Color.NAMES.red)

        this.normalArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 1)
        scene.add(this.normalArrow);

        this.normalArrow.setColor(THREE.Color.NAMES.blue)

        // const geometry = new THREE.RingGeometry(0, 1)
        // const material = new THREE.MeshBasicMaterial( { color: 0xffff00, side: THREE.DoubleSide } );
        // this.curvatureRing = new THREE.Mesh( geometry, material )
        //     .translateY(0.01)
        //     .rotateX(Math.PI/2)
        // scene.add(this.curvatureRing);

        this.setNameBillboard(name)

        scene.add(this.worldMesh)

        this.setPose(startingPose)
    
        this.scene = scene
    }

    setNameBillboard(name: string) {
        const geometry = new THREE.PlaneGeometry(2, 0.5)
        const canvas = document.createElement('canvas')
        canvas.width = 400
        canvas.height = 100
        const padding = 10
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#00f'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const fontSize = Math.floor(canvas.width / (this.name.length * 1.2)) * 2
        ctx.font = `bold ${fontSize}px monospace`
        ctx.fillStyle = '#f00'
        ctx.fillText(this.name, fontSize * 0.05, canvas.height / 2 + fontSize / 4)
        const texture = new THREE.CanvasTexture(canvas)
        const material = new THREE.MeshBasicMaterial({ map: texture });
        const nameBillboard = new THREE.Mesh(geometry, material)

        scene.add(nameBillboard)
        this.nameBillboard = nameBillboard
    }

    destroy() {
        // Should also dispose materials? But not sure how

        this.scene.remove(this.arrowHelper)

        this.scene.remove(this.nameBillboard)

        this.localRiderMesh.geometry.dispose()
        this.localMesh.geometry.dispose()
        this.worldMesh.geometry.dispose()

        this.scene.remove(this.worldMesh)
    }
}

class UnicycleCameraController {
    camera: THREE.Camera
    unicycle: Unicycle

    constructor(camera: THREE.Camera, unicycle: Unicycle) {
        this.camera = camera
        this.unicycle = unicycle
    }

    update() {
        const heading = this.unicycle.getHeading()
        const position = this.unicycle.getPosition()
        const camPosition = position.clone().sub(heading.multiplyScalar(10))
        camPosition.y += 10
        camera.position.set(...xyz(camPosition))
        // console.log(camPosition)
        camera.up = new THREE.Vector3(0, 1, 0)
        camera.lookAt(position)
        camera.updateProjectionMatrix()
    }
}


const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(-3, 3, 3)
camera.lookAt(10, 10, 10)

const renderer = new THREE.WebGLRenderer()

renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)

const plane = (() => {
    const geometry = new THREE.PlaneGeometry(100, 100)
    const material = new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide });
    return new THREE.Mesh(geometry, material)
        .rotateX(Math.PI / 2);
})()

function generateFigureEightMesh(): THREE.Mesh {
    const n = 200    

    const segments = []

    let x1, y1, z1

    const width = 8

    for (let i = 0; i < n; i++) {
        let t = i/(n-1) * 2 * Math.PI

        let x = FigureEight.radius * Math.cos(t) / (1 + Math.sin(t)**2)
        let z = (FigureEight.radius * Math.sin(t) * Math.cos(t)) / (1 + Math.sin(t)**2)

        let y = 10 * (1 - clamp(Math.abs(t - 4.72), 0, 1))

        y = clamp(y, 0, 8)

        if (i == 0) {
            x1 = x
            y1 = y
            z1 = z
            continue
        }

        const length = Math.hypot(x - x1, z - z1) + 0.2
        
        const angle = Math.atan2(x - x1, z - z1)

        const vertAngle = -Math.atan2(y - y1, 1)
        
        const segment = new THREE.PlaneGeometry(width, length)
            // .rotateX(degToRad(30))
            .rotateX(vertAngle + Math.PI/2)
            .rotateY(angle)
            .translate(x, y, z)

        segments.push(segment)

        x1 = x
        y1 = y
        z1 = z
    }

    const geom = BufferGeometryUtils.mergeGeometries(segments)

    const material = new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide });

    const figureEight = new THREE.Mesh(geom, material) 
    
    const finishLineWidth = width

    console.log('finish line', FinishLine)
    const texture = new THREE.TextureLoader().load(FinishLine)
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set( 16, 2 );
    texture.magFilter = THREE.NearestFilter
    const finishLineGeometry = new THREE.PlaneGeometry(finishLineWidth, 0.5)
    const finishLineMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide  })

    const finishLine = new THREE.Mesh(finishLineGeometry, finishLineMaterial)
        .rotateX(Math.PI/2)
        .rotateZ(Math.PI/4 + Math.PI/2)

    finishLine.position.set(0, 0.01, 0)

    const mesh = new THREE.Mesh()

    mesh.add(figureEight)
    mesh.add(finishLine)

    return mesh
}

function generateLoopMesh(): THREE.Mesh {
    const geometry = new THREE.RingGeometry(Loop.innerRadius, Loop.outerRadius, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide });
    
    const mesh = new THREE.Mesh(geometry, material)
        .rotateX(Math.PI / 2);

    const finishLineWidth = Loop.outerRadius - Loop.innerRadius

    console.log('finish line', FinishLine)
    const texture = new THREE.TextureLoader().load(FinishLine)
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set( 16, 2 );
    texture.magFilter = THREE.NearestFilter
    const finishLineGeometry = new THREE.PlaneGeometry(finishLineWidth, 0.5)
    const finishLineMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide  })

    const finishLine = new THREE.Mesh(finishLineGeometry, finishLineMaterial)

    finishLine.position.set(Loop.innerRadius + finishLineWidth/2 - 0.05, 0.0, -0.01)

    mesh.add(finishLine)

    return mesh
}

const trackMeshGenerators: {
    [key in TrackType]: () => THREE.Mesh
} = {
    FigureEight: generateFigureEightMesh,
    Loop: generateLoopMesh
}

const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
scene.add(directionalLight);

; (async () => {
    const existingName = localStorage.getItem('name')    

    const {
        player,
        players,
        leaderboard,
        trackType
    } = (await new Promise<InitClient>((resolve) => {
        socket.emit('join', existingName, resolve)
    }))

    track = new trackTypeToTrack[trackType]()

    const mesh = trackMeshGenerators[trackType]()

    scene.add(mesh)

    console.log('Joined server! My uuid', player.uuid)
    console.log('Other players currently on server:', players)

    let unicycle = new Unicycle(scene, player.pose, player.name)

    localStorage.setItem('name', player.name)

    let cameraController = new UnicycleCameraController(camera, unicycle)

    const playerUnicycles: {[uuid: string]: Unicycle} = {}

    for (const p of players) {
        playerUnicycles[p.uuid] = new Unicycle(scene, p.pose, p.name)
    }

    playerUnicycles[player.uuid] = unicycle

    setLeaderboardRows(leaderboard)

    socket.on('updateLeaderboard', leaderboard => {
        console.log('new leaderboard', leaderboard)
        setLeaderboardRows(leaderboard)
    })

    socket.on('chat', text => {
        console.log('Received message event', text)
        log(text)
    })

    socket.on('playerJoin', p => {
        const unicycle = new Unicycle(scene, p.pose, p.name)
        unicycle.setPose(player.pose)
        playerUnicycles[p.uuid] = unicycle
    })

    socket.on('playerLeave', uuid => {
        const u = playerUnicycles[uuid]
        log(`${u.name} left`)
        console.log('player left, destroying unicycle', u)
        u.destroy()
        delete playerUnicycles[uuid]
    })

    socket.on('playerChangeName', (uuid, name) => {
        console.log('player change name', uuid, name)
        if (uuid === player.uuid) {
            player.name = name
            unicycle.updateName(name)
        }  else {
            const u = playerUnicycles[uuid]
            u.updateName(name)
        }
    })

    socket.on('playerMove', (uuid, pose, velocities) => {
        console.log('received player move event')
        if (!(uuid in playerUnicycles)) {
            console.error(`Received update event for unknown player (${uuid})`, Object.keys(playerUnicycles))
            return
        }

        if (uuid == player.uuid) {
            // Don't update local position based on server.
            // *If* cared about cheating, then would have guarentees, but
            // don't bother.
            return
        }

        const u = playerUnicycles[uuid]
        u.setPose(pose)
        u.setVelocities(velocities)
    })

    let gameFocused = true

    chatInput.addEventListener('focusin', () => {
        gameFocused = false
    })

    chatInput.addEventListener('focusout', () => {
        gameFocused = true
    })

    chatInput.addEventListener('keydown', (event) => {
        if (event.key == 'Enter') {
            const value = chatInput.value
            
            if (value.startsWith('/')) {
                // Run command
                const i = value.indexOf(' ')
                const command = value.slice(1, i)
                const args = value.slice(i + 1)

                switch (command) {
                    case 'name':
                        console.log('sending setName event')
                        socket.emit('setName', args, () => {
                            log(`Updated name to '${args}'`)
                        })
                        localStorage.setItem('name', args)
                        break
                    default:
                        log(`Unexpected command '${value}'`)
                }
            } else {
                // Send message to server
                const text = `${unicycle.name}: ${value}`
                socket.emit('chat', text)
            }

            chatInput.value = ''
        }
    })

    window.addEventListener('resize', onWindowResize, false)

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
        render()
    }

    function restart() {
        socket.emit('restart', pose => {
            // HACK: Should just reset unicycle pose,
            // but weird bug with resetting rider roll.
            // So reconstruct the unicycle instead

            delete playerUnicycles[player.uuid]

            unicycle.destroy()
            unicycle = new Unicycle(scene, pose, player.name)
            cameraController = new UnicycleCameraController(camera, unicycle)

            playerUnicycles[player.uuid] = unicycle
        })
    }

    document.addEventListener('keydown', event => {
        if (event.code === 'KeyR') restart()
    })

    function loop() {
        setTimeout(() => requestAnimationFrame(loop), 1000 / FPS)

        // mesh.rotation.x += 0.01
        // mesh.rotation.y += 0.01

        if (gameFocused)
            unicycle.handleInput()

        for (const u of Object.values(playerUnicycles)) {
            u.update()
        }

        socket.emit('playerMove', unicycle.getPose(), unicycle.getVelocities())

        if (USE_DEBUG_CAMERA) {
            controls.update()
        } else {
            cameraController.update()
        }

        render()

        timeSeconds += tickDelta
    }

    function render() {
        renderer.render(scene, camera)
    }

    loop()
})()