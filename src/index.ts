import './style.css'

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils'
import { degToRad, inverseLerp, lerp, radToDeg } from 'three/src/math/MathUtils'

const FPS = 60
const tickDelta = 1/FPS
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
document.body.appendChild(positionText)

let timeSeconds = 0

const keysHeld = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    Shift: false,
    Space: false,
}

document.addEventListener('keydown', (event) => {
    if (event.code in keysHeld) (keysHeld as any)[event.code] = true
})

document.addEventListener('keyup', (event) => {
    if (event.code in keysHeld) (keysHeld as any)[event.code] = false
})

const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x))

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
    worldMeshYaw = 0

    heading: THREE.Vector3

    name: string = "Player 1"
    nameBillboard: THREE.Mesh

    setPosition(position: THREE.Vector3) {
        this.worldMesh.position.set(position.x, position.y, position.z)
    }

    getPosition(): THREE.Vector3 {
        return this.worldMesh.position
    }

    getHeading(): THREE.Vector3 {
        return new THREE.Vector3(Math.sin(this.worldMeshYaw + Math.PI/2), 0, Math.cos(this.worldMeshYaw + Math.PI/2))
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
                .rotateX(Math.PI/2)
    
            const spokes = Array.from({ length: nSpokes }, (_, i) => {
                const t = i/(nSpokes - 1)
                const theta = Math.PI/2 + t * 2 * Math.PI
                const length = radius - 2 * tubeRadius
                return new THREE.CylinderGeometry(spokeRadius, spokeRadius, length, 5, 5)
                    .translate(0, hubRadius + length/2, 0)
                    .rotateZ(theta)
            })
    
            return BufferGeometryUtils.mergeGeometries([torus, hub, ...spokes])
                .rotateZ((2 * Math.PI)/(nSpokes-1))
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
        mesh.translateY(size.y/2)

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
            .translateY(size.y + riderHeight/2 + this.localRiderOffsetY)
        return mesh
    }

    update() {
        if (keysHeld.KeyW) this.dPitchMomentum -= this.maxOmegaRadiansPerSecond * tickDelta
        if (keysHeld.KeyS) this.dPitchMomentum += this.maxOmegaRadiansPerSecond * tickDelta

        if (keysHeld.KeyD || keysHeld.KeyA) {
            const leanSpeedDeg = 200
            const theta = degToRad((keysHeld.KeyD ? leanSpeedDeg : 0) + (keysHeld.KeyA ? -leanSpeedDeg : 0)) * tickDelta
            this.localRiderMesh.rotateX(theta)
            this.localRiderMesh.geometry.computeBoundingBox()
            const size = new THREE.Vector3
            this.localRiderMesh.geometry.boundingBox.getSize(size)
            const dx = Math.sin(theta) * size.y/2
            this.localRiderMesh.translateZ(dx)
        }

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
            + Math.sin(this.localRiderMesh.rotation.x) * (riderSize.y/2 + this.localRiderOffsetY))
        let torque = rX * gravity * wheelMass


        this.worldMeshRollMomentum += torque/wheelInertia * tickDelta

        if (Math.abs(this.worldMeshRoll) < Math.PI/2) {
            this.worldMeshRoll += this.worldMeshRollMomentum * tickDelta
        }


        this.worldMesh.rotation.x = clamp(this.worldMesh.rotation.x, -Math.PI/2, Math.PI/2)
        
        const r = wheelMeshSize.x/2
        const dx = this.dPitchMomentum * tickDelta * r

        this.dPitchMomentum += -dx * friction
        
        // const k = 1/inverseLerp(0, Math.PI/2, this.roll)

        const denom = lerp(0, 1, inverseLerp(0, Math.PI/2, Math.abs(this.worldMeshRoll)))
        let k = Math.abs(denom) < 1e-6 ? Infinity : 1/denom
        // k = 10

        this.heading = new THREE.Vector3(Math.sin(this.worldMeshYaw + Math.PI/2), 0, Math.cos(this.worldMeshYaw + Math.PI/2))
        this.arrowHelper.position.set(this.worldMesh.position.x, 0, this.worldMesh.position.z)
        this.arrowHelper.setDirection(this.heading)

        const speed = -this.dPitchMomentum

        this.worldMesh.position.add(this.heading.multiplyScalar(speed * tickDelta))

        this.worldMeshYaw -= Math.sign(this.worldMeshRoll) * speed/k * tickDelta


        // this.worldMeshRoll = Math.sin(timeSeconds)

        this.worldMesh.rotation.set(0, 0, 0)
        this.worldMesh.rotateY(this.worldMeshYaw)
        this.worldMesh.rotateX(this.worldMeshRoll)

        // TODO: Switch from naive Euler angles to rotation vector

        if (!onTrack(this.worldMesh.position.x, this.worldMesh.position.z)) {
            this.worldMesh.position.y -= gravity * tickDelta
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

    constructor(scene: THREE.Scene, name: string = "Player 1") {
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

        {
            const geometry = new THREE.PlaneGeometry(2, 0.5)
            const canvas = document.createElement('canvas')
            canvas.width = 400
            canvas.height = 100
            const padding = 10
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#00f'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            const fontSize = Math.floor(canvas.width/(this.name.length * 1.2)) * 2
            ctx.font = `bold ${fontSize}px monospace`
            ctx.fillStyle = '#f00'
            ctx.fillText(this.name, fontSize * 0.05, canvas.height/2 + fontSize/4)
            const texture = new THREE.CanvasTexture(canvas)
            const material = new THREE.MeshBasicMaterial({ map: texture });
            const nameBillboard = new THREE.Mesh( geometry, material )

            scene.add(nameBillboard)
            this.nameBillboard = nameBillboard
            // this.nameBillboard.position.set(20, 5, 0)
        }
        

        scene.add(this.worldMesh)
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
        console.log(camPosition)
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
    const material = new THREE.MeshBasicMaterial( {color: 0x888888, side: THREE.DoubleSide} );
    return new THREE.Mesh( geometry, material )
        .rotateX(Math.PI/2);
})()

const innerTrackRadius = 20
const outerTrackRadius = 50

const track = (() => {
    const geometry = new THREE.RingGeometry( innerTrackRadius, outerTrackRadius, 32 ); 
    const material = new THREE.MeshBasicMaterial( {color: 0x888888, side: THREE.DoubleSide} );
    return new THREE.Mesh( geometry, material )
        .rotateX(Math.PI/2);
})()

const onTrack = (x: number, z: number) => {
    // TODO: Switch to THREE.js colliders
    const r = Math.hypot(x, z)
    return r > innerTrackRadius && r < outerTrackRadius
}

scene.add(track);

const axesHelper = new THREE.AxesHelper( 5 );
scene.add( axesHelper );

const directionalLight = new THREE.DirectionalLight( 0xffffff, 0.5 );
scene.add( directionalLight );

const unicycle = new Unicycle(scene)
unicycle.setPosition(new THREE.Vector3((innerTrackRadius + outerTrackRadius)/2, 0, 0))

const cameraController = new UnicycleCameraController(camera, unicycle)

const unicycle2 = new Unicycle(scene, "Dummy Unicycle")
unicycle2.setPosition(new THREE.Vector3((innerTrackRadius + outerTrackRadius)/2, 0, 0))

window.addEventListener('resize', onWindowResize, false)

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    render()
}

function loop() {
    setTimeout(() => requestAnimationFrame(loop), 1000/FPS)

    // mesh.rotation.x += 0.01
    // mesh.rotation.y += 0.01

    unicycle.update()
    unicycle2.updateBillboard()

    cameraController.update()

    // controls.update()

    render()

    timeSeconds += tickDelta
}

function render() {
    renderer.render(scene, camera)
}

loop()
