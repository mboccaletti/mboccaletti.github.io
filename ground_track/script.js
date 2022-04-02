import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { OrbitControls } from '/resources/scripts/OrbitControls.js';
import { OBJLoader } from '/resources/scripts/OBJLoader.js';
import { MTLLoader } from '/resources/scripts/MTLLoader.js';

var scene = new THREE.Scene();
scene.background = new THREE.Color('#2d2e38'); //0a0a0a

/* ----- Physical model ----- */
const earthMU = 3.986 * 100000; // km^3/s^2
const earthRadius = 6378.137; // km
const earthPolarRadius = 6356.752; // km
const earthAngularVelocity = 0.0000729211840505999; // rad/s


/* ----- Data ----- */
var objData;

function loadData() {
    d3.json("resources/data/ground_track.json").then(function(data) {
        objData = data;

        loadControls();
    })
}
loadData();


/* ----- Inputs ----- */
const input = {
    simulationSpeed: 500,
    eccentricity: 0.3,
    altitudeOfPerigee: 480, // km
    raan: 65, // deg
    inclination: 46, // deg
    aop: 270, // deg
    meanAnomaly: 0
}


/* ----- Auxiliar variables ----- */
var a, c, b, Rp, rotationMatrix, T;

function updateVariables() {
    a = (earthRadius + input.altitudeOfPerigee) / earthRadius / (1 - input.eccentricity);
    c = a * input.eccentricity;
    b = (a**2 - c**2)**(0.5);
    Rp = (earthRadius + input.altitudeOfPerigee) / earthRadius;
    T = Math.sqrt(Math.pow(a * earthRadius,3)*4*Math.pow(Math.PI,2)/earthMU);

    rotationMatrix = new THREE.Matrix4();
    const R1 = new THREE.Matrix4().makeRotationY(input.raan * Math.PI / 180);
    const R2 = new THREE.Matrix4().makeRotationZ(input.inclination * Math.PI / 180);
    const R3 = new THREE.Matrix4().makeRotationY(input.aop * Math.PI / 180);
    rotationMatrix.multiplyMatrices(R1, R2).multiply(R3);
}
updateVariables();


/* ----- Axes helper ----- */
const axesHelper = new THREE.AxesHelper(2);
//axesHelper.setColors('#ffa800', '#ffa800', '#ffa800');

scene.add(axesHelper);


/* ----- Render orbit ----- */
const orbit = new THREE.Group();

const track = (function() {
    let trackGeo = new THREE.RingBufferGeometry(1, 1, 300);
    let trackMat = new THREE.LineBasicMaterial({color: '#0072f0'}); // #0072f0 
    trackGeo.rotateX(Math.PI / 2); // rotate geometry so default is equatorial orbit

    return new THREE.Line(trackGeo, trackMat);
})();
orbit.add(track);

function renderTrack() {    
    track.position.z = -c;
    track.scale.set(b, 1.0, a);    
}
renderTrack();

var satellite = new THREE.Object3D();
satellite = await (async function() {
    let objLoader = new OBJLoader(),
        mtlLoader = new MTLLoader();
    
    let gistUrl = "https://gist.githubusercontent.com/jake-low/ae6f79de55ca9e4612957158a1637ab0/raw/439e9c2986d9ed5a7eba66921b6c1458bf75d455/";
    
    objLoader.setPath(gistUrl);
    
    mtlLoader.setPath(gistUrl);
    mtlLoader.setResourcePath(gistUrl);
    
    let materials = await new Promise((resolve, reject) =>
        mtlLoader.load("NPP.mtl", resolve, () => {}, reject)
    );
    
    materials.preload();

    console.log(materials.materials);
    console.log(typeof(materials.materials));
    console.log(Object.keys(materials.materials));
    console.log(materials.materials['foil_gold'].opacity);

    // materials.materials['foil_gold'].emissive = '#666666';

    console.log(materials.materials['foil_gold'].color);

    for (let m in materials.materials) {
        materials.materials[m].color = materials.materials[m].color.addScalar(0.5)
    }

    console.log(materials.materials['foil_gold'].color);
    
    
    objLoader.setMaterials(materials);
    
    const satellite = await new Promise((resolve, reject) =>
        objLoader.load("NPP.obj", resolve, () => {}, reject)
    );
    
    satellite.scale.setScalar(0.03);
    satellite.rotation.x = -Math.PI / 2;
    
    satellite.position.z = Rp;

    orbit.add(satellite);

    return satellite;
})();

function renderSatellite(timeDelta) {

    // Get new mean anomaly (M_) in t_ = t + dt
    const M_ = input.meanAnomaly + 2 * Math.PI / T * timeDelta;

    // Get eccentric anomaly (E_) in t_ (given by Newton-Raphson method)
    let E_ = 0;
    if (M_ < Math.PI)
        E_ = M_ + input.eccentricity/2.;
    else
        E_ = M_ - input.eccentricity/2.;

    let ratio = 1.;

    //while (Math.abs(ratio) > 0.00000001) {
    for (let j = 0; j < 200; j++) {
        ratio = (E_ - input.eccentricity*Math.sin(E_) - M_) / (1 - input.eccentricity*Math.cos(E_));
        ratio = parseFloat(ratio.toFixed(20))
        E_ = E_ - ratio;
    }

    // Get true anomaly (f_) in t_
    let f_ = 0;
    if (Math.abs(E_) == Math.PI)
      f_ = E_;
    else
      f_ = 2*Math.atan(Math.sqrt((1+input.eccentricity)/(1-input.eccentricity))*Math.tan(E_/2));

    // get radius in t_
    const r = a*(1 - Math.pow(input.eccentricity, 2))/(1 + input.eccentricity*Math.cos(f_));

    // set new position in t_
    satellite.position.z = r*Math.cos(f_);
    satellite.position.x = r*Math.sin(f_);
  
    // // set new rotation in t_
    satellite.rotation.z = E_ - Math.PI / 2;

    input.meanAnomaly = M_;
}

scene.add(orbit);

function renderOrbit() {
    orbit.setRotationFromMatrix(rotationMatrix);
}
renderOrbit();


/* ----- Map (initial) ----- */
var groundTrack;

const naturalEarth = await d3.image(
    "https://gist.githubusercontent.com/jake-low/d519e00853b15e9cec391c3dab58e77f/raw/6e796038e4f34524059997f8e1f1c42ea289d805/ne1-small.png",
    {crossOrigin: "anonymous"});

var map = document.getElementById('map');

var map_width = map.parentElement.offsetWidth,
    map_height = map_width / 2,
    aspect = map_width / map_height;

const context = map.getContext('2d');

context.canvas.width = map_width;
context.canvas.height = map_height;

function renderMap() {
    context.drawImage(naturalEarth, 0, 0, map_width, map_height);

    const projection = d3.geoEquirectangular()
        .fitSize([map_width, map_width/2], { type: 'Sphere' })
        .precision(0.1)

    const path = d3.geoPath()
        .projection(projection)
        .context(context);

    if (groundTrack) {
        let line = groundTrack.slice();
        const lineWidth = 1.25 + (map_width / 1200);

        if (d3.geoDistance(line[0], line[line.length - 1]) < 0.05) {
            // special case: geosynchronous orbit
            context.strokeStyle = 'rgb(255, 0, 0)';
            context.lineWidth = 2 * lineWidth;

            context.beginPath();
            path(d3.geoCircle().center(line[0]).radius(0.05)());
            context.stroke();
        } else {
            let opacity = 1.0;
            let decay = opacity / line.length;
            context.lineWidth = lineWidth;

            while (line.length > 1) {
                
                let start = line[0],
                    end = line[1];

                context.strokeStyle = `rgba(255, 0, 0, ${opacity})`;

                let segment = {
                    type: 'LineString',
                    coordinates: [start, end],
                };

                context.beginPath(), path(segment), context.stroke();

                opacity -= decay;
                line.shift();
            }
        }
    }

    return context.canvas;
}
map = renderMap();


/* ----- Earth ----- */
var earthTexture;
const earth = (function() {

    const earthGeo = new THREE.SphereBufferGeometry (1, 40, 40),
          earthMat = new THREE.MeshPhongMaterial({shininess: 10});
    // Diffuse map
    //earthMat.map = new THREE.TextureLoader().load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/123941/earthmap.jpg');
    //earthMat.map = new THREE.TextureLoader().load('https://gist.githubusercontent.com/jake-low/d519e00853b15e9cec391c3dab58e77f/raw/6e796038e4f34524059997f8e1f1c42ea289d805/ne1-small.png');
    earthTexture = new THREE.CanvasTexture(map);
    earthMat.map = earthTexture;

    // Bump map
    earthMat.bumpMap = new THREE.TextureLoader().load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/123941/bump-map.jpg');
    earthMat.bumpScale = 0.2;

    const earth = new THREE.Mesh(earthGeo, earthMat);
    earth.position.set(0, 0, 0);
    earth.rotation.y = - Math.PI / 2;
    earth.scale.y = earthPolarRadius / earthRadius;

    return earth;

})();
scene.add(earth);

function renderEarth(sideralTime, timeDelta) {
    earthTexture.needsUpdate = true;
    if (sideralTime) {
        earth.rotation.y = - Math.PI / 2 + sideralTime;
    } else {
        earth.rotation.y += earthAngularVelocity * timeDelta;
    }
}


/* ----- Render ground-track ----- */
function renderGroundTrack() {

    const timeBetweenPoints = -300,
          numPoints = Math.min(200, 2 * T/ Math.abs(timeBetweenPoints)),
          points = [];
    
    const M = input.meanAnomaly;

    for (let i = 0; i < numPoints; i++) {

        // get mean anomaly (M_) in t_ = t - dt * i
        const M_ = M + 2 * Math.PI / T * i * timeBetweenPoints;
  
        // get eccentric anomaly (E_) in t_ (given by Newton-Raphson method)
        let E_ = 0;
        if (M_ < Math.PI)
          E_ = M_ + input.eccentricity/2.;
          
          E_ = M_ - input.eccentricity/2.;
  
        let ratio = 1.0;
  
        //while (Math.abs(ratio) > 0.00000001) {
        for (let j = 0; j < 200; j++) {
          ratio = (E_ - input.eccentricity*Math.sin(E_) - M_) / (1 - input.eccentricity*Math.cos(E_));
          E_ = E_ - ratio;
        }
  
        // get true anomaly (f_) in t_
        let f_ = 0;
        if (Math.abs(E_) == Math.PI)
          f_ = E_;
        else
          f_ = 2*Math.atan(Math.sqrt((1+input.eccentricity)/(1-input.eccentricity))*Math.tan(E_/2.));
  
        // get radius in t_
        let r = a*(1 - Math.pow(input.eccentricity, 2.))/(1 + input.eccentricity*Math.cos(f_));
  
        // get new position in perifocal frame
        let newPosition = new THREE.Vector3(r * Math.sin(f_), 0, r * Math.cos(f_));
  
        // rotate r
        newPosition.applyMatrix4(rotationMatrix);
  
        let newEarthFramePosition = earth.worldToLocal(newPosition);
  
        // correct for the amout of time Earth has/will have rotated during timeOffset
        newEarthFramePosition.applyAxisAngle(
            new THREE.Vector3(0, 1, 0), -earthAngularVelocity * i * timeBetweenPoints);
  
        // convert back to spherical one more time so we can get theta and phi
        let sphericalNewEarthFramePosition = new THREE.Spherical();
        sphericalNewEarthFramePosition.setFromVector3(newEarthFramePosition);
        sphericalNewEarthFramePosition.makeSafe();
  
        // convert to degrees
        let theta = sphericalNewEarthFramePosition.theta * 180 / Math.PI,
            phi = sphericalNewEarthFramePosition.phi * 180 / Math.PI;
  
        // convert theta and phi to longitude and latitude
        let longitude = (theta - 90),
            latitude = (90 - phi);
  
        points.push([longitude, latitude]);
    }

    return points;
};


/* ----- Light ----- */
var ambient = new THREE.AmbientLight('#888', 1)
var directional = new THREE.DirectionalLight("#aaa")
directional.position.set(10, 10, 0);
var spot = new THREE.SpotLight(0xFFFFFF, 1, 0, Math.PI / 2, 1);
spot.position.set(400, 400, 150);
spot.target.position.set(100, 380, 100);
spot.castShadow = true;

var light = new THREE.Group();
light.add(ambient, directional);

scene.add(light);


/* ----- Renderer ----- */
var container = document.getElementById('three');

var WIDTH = container.offsetWidth,
    HEIGHT = WIDTH / 3,
    aspect = WIDTH / HEIGHT;

var renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(WIDTH, HEIGHT);
renderer.domElement.style.position = 'relative';

container.appendChild(renderer.domElement);
renderer.autoClear = false;
renderer.shadowMap.enabled = true;

var clock = new THREE.Clock();

function render() {
    const timeDelta = clock.getDelta() * input.simulationSpeed;

    renderSatellite(timeDelta);

    renderOrbit();

    groundTrack = renderGroundTrack();

    map = renderMap();
   
    renderEarth(undefined, timeDelta);

    renderer.render(scene, camera);
}


/* ----- Camera ----- */
const frustumSize = 5;
var camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 60000);
camera.position.set(300, 100, 500);
//camera.position.set(0, 4, 0);
camera.lookAt(earth.position);


/* ----- View Controls ----- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.minZoom = 0.2;
controls.maxZoom = 2;

const redraw = () => render();

controls.addEventListener("change", redraw);


/* ----- Animate ----- */

var clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    render();
}

animate();


/* ----- Side Controls ----- */
document.querySelectorAll('.slider-input').forEach(item => {
    item.addEventListener('input', event => {

        let id = item.getAttribute('id');

        let value = item.parentElement.getElementsByClassName('slider-value')[0].getAttribute('value');
        value = value.replace('{value}', item.value)
        item.parentElement.getElementsByClassName('slider-value')[0].innerHTML = value;
       
        input[id] = parseFloat(item.value);

        updateVariables();
        renderTrack();
    })
})

function loadControls() {
    let options = ['<option value=0>selecione</option>'];

    for (var obj of objData) {
        options.push(`<option value="${obj[0]}">${obj[1]}</option>`);
    }
    d3.select('#object-select')
        .html(options.join());
}

document.querySelector('#object-select').onchange = function() {

    let data = objData.filter((d) => d[0] == this.value)[0];

    input.eccentricity = data[3];
    input.altitudeOfPerigee = data[7];
    input.raan = data[4];
    input.inclination = data[5];
    input.aop = data[6];
    input.meanAnomaly = data[2] * Math.PI / 180;

    renderEarth(data[8], 0);

    for (let i in input) {
        document.getElementById(i).value = input[i].toString();
        document.getElementById(i).dispatchEvent(new Event('input'));
    }
}

/*

TO DO:

Deixar o satélite claro

*/