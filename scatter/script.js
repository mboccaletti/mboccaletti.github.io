import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { OrbitControls } from '/resources/scripts/OrbitControls.js';

var scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0a0a');

/* ----- Physical model ----- */
const earthRadius = 6378.137;
const earthPolarRadius = 6356.752;


/* ----- Data ----- */
var dimension = 0; // 0 = utility, 1 = owner, 2 = altitude
var dimensions = [
    ['PAY', 'R/B', 'DEB', 'UNK'],
    [],
    ['LEO', 'MEO', 'HEO/GEO']
]
var labels;
var owners;

var scatterData;

function loadData() {
    d3.json("resources/data/scatter.json").then(function(data) {
        scatterData = data;

        let ownerCount = Object.fromEntries(d3.rollup(data, v => v.length, d => d[1]));
        owners = Object.keys(ownerCount).sort((a,b) => ownerCount[b] - ownerCount[a]);
        dimensions[1] = owners.slice(0, 3);
        dimensions[1].push('outros');

        labels = dimensions[dimension];

        loadLegend();
        loadControls();
    })
}
loadData();


/* ----- Color pallete ----- */
const colors = [
    '#00b6cb', // light blue
    '#ffa800', // yellow
    '#f10096', // pink
    '#7cb342', // green
    '#0072f0', // dark blue
    '#f66d00', // orange
]


/* ----- Axes helper ----- */
const axesHelper = new THREE.AxesHelper(2);


var scatter;

function renderScatter() {
    
    const scatterGeo = new THREE.BufferGeometry();
    const scatterPositions = [];
    const scatterColors = [];

    const color = new THREE.Color();

    let plotData = scatterData.filter((d) =>
        filters[0].includes(d[0])
        && filters[1].includes(d[1])
        && filters[2].includes(d[2])
    );

    for (let i in plotData) {

        let spaceObj = plotData[i];

        let j = labels.indexOf(spaceObj[dimension]);        

        if (j == -1)
            j = 3;
        color.set(colors[j]);

        scatterPositions.push(spaceObj[4] / earthRadius, spaceObj[5] / earthRadius, spaceObj[3] / earthRadius);
        scatterColors.push(color.r, color.g, color.b);
    }

    scatterGeo.setAttribute('position', new THREE.Float32BufferAttribute(scatterPositions, 3));
    scatterGeo.setAttribute('color', new THREE.Float32BufferAttribute(scatterColors, 3));

    scatterGeo.computeBoundingSphere();

    const scatterMaterial = new THREE.PointsMaterial({size: 1.1, vertexColors: true});

    scene.remove(scatter);

    scatter = new THREE.Points(scatterGeo, scatterMaterial);
    
    scene.add(scatter);
}


/* ----- Earth ----- */
const earthGeo = new THREE.SphereBufferGeometry (1, 40, 40),
      earthMat = new THREE.MeshPhongMaterial({shininess: 10});

// Diffuse map
earthMat.map = new THREE.TextureLoader().load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/123941/earthmap.jpg');

// Bump map
earthMat.bumpMap = new THREE.TextureLoader().load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/123941/bump-map.jpg');
earthMat.bumpScale = 0.3;

var earthMesh = new THREE.Mesh(earthGeo, earthMat);
earthMesh.position.set(0, 0, 0);
earthMesh.rotation.y = - Math.PI / 2;
earthMesh.scale.y = earthPolarRadius / earthRadius;


/* ----- Light ----- */
var ambient = new THREE.AmbientLight('#282828', 0.7)
var directional = new THREE.DirectionalLight("#ccc")
directional.position.set(10, 10, 0);
var spot = new THREE.SpotLight(0xFFFFFF, 1, 0, Math.PI / 2, 1);
spot.position.set(400, 400, 150);
spot.target.position.set(100, 380, 100);
spot.castShadow = true;

var light = new THREE.Group();
light.add(ambient, directional);

var WIDTH = window.innerWidth - 30,
    HEIGHT = window.innerHeight - 30;


/* ----- Renderer ----- */

var container = document.getElementById('container');

var WIDTH = container.offsetWidth,
    HEIGHT = container.offsetHeight,
    aspect = WIDTH / HEIGHT;

var renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(WIDTH, HEIGHT);
renderer.domElement.style.position = 'relative';

container.appendChild(renderer.domElement);
renderer.autoClear = false;
renderer.shadowMap.enabled = true;

var clock = new THREE.Clock();

function render() {
    renderer.render(scene, camera);
}


/* ----- Camera ----- */
const frustumSize = 5;
var camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 60000);
camera.position.set(300, 100, 500);
//camera.position.set(0, 4, 0);
camera.lookAt(earthMesh.position);


/* ----- Controls ----- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.minZoom = 0.4;
controls.maxZoom = 2;

camera.lastZoom = 0;

function redraw() {
    render();
};

/* ----- Scene ----- */
scene.add(light);
//scene.add(axesHelper);
scene.add(earthMesh);

controls.addEventListener("change", redraw);

function animate() {
    requestAnimationFrame(animate);
    render(); 
}

animate();


/* ----- UI ----- */
function loadLegend() {
    
    // Legend
    d3.selectAll('.legend-color')
        .each(function(d, i) {
            if (labels[i] == undefined)
                d3.select(this)
                    .style('opacity', 0)
            else
                d3.select(this)
                    .style('opacity', 1)
                    .style('border-color', colors[i])
        });

    d3.selectAll('.legend-label')
        .each(function(d, i) {
            d3.select(this).text(labels[i])
        });
}

function loadControls() {
    // Controls
    d3.select('#control_utility').select('.control-list')
        .html('');
    for (var u in dimensions[0]) {
        u = dimensions[0][u];
        d3.select('#control_utility').select('.control-list')
            .append('label')
            .attr('class', 'checkbox-container')
            .attr('for', u)
                .html(`
                    ${u}
                    <input type="checkbox" class="checkbox-utility" id="${u}" name="${u}" checked="checked">
                    <span class="checkmark"></span>
                `);
        
    }
    
    d3.select('#control_owner').select('.control-list')
        .html('');
    for (var o in owners) {
        o = owners[o];
        
        d3.select('#control_owner').select('.control-list')
            .append('label')
            .attr('class', 'checkbox-container')
            .attr('for', o)
                .html(`
                    ${o}
                    <input type="checkbox" class="checkbox-owner" id="${o}" name="${o}" checked="checked">
                    <span class="checkmark"></span>
                `);
    }
    
    d3.select('#control_altitude').select('.control-list')
        .html('');
    for (var a in dimensions[2]) {
        a = dimensions[2][a];
        
        d3.select('#control_altitude').select('.control-list')
            .append('label')
                .attr('class', 'checkbox-container')
                .attr('for', a)
                    .html(`
                        ${a}
                        <input type="checkbox" class="checkbox-altitude" id="${a}" name="${a}" checked="checked">
                        <span class="checkmark"></span>
                    `);
    }

    document.querySelector('#control_utility').onchange = function() {
        loadFilters();
    }

    document.querySelector('#control_owner').onchange = function() {
        loadFilters();
    }

    document.querySelector('#control_altitude').onchange = function() {
        loadFilters();
    }

    loadFilters();
}

/* ----- Dimension Selector ----- */
document.querySelector('#dimension-select').onchange = function() {
    dimension = this.value;
    labels = dimensions[dimension];
    loadLegend();
    renderScatter();
}

var filters = [
    [],
    [],
    []
];

function loadFilters() {

    for (let i in filters) {
        filters[i] = [];
    }

    d3.selectAll('#control_utility input:checked')
        .each(function() {
            filters[0].push(this.name);
        });
    
    d3.selectAll('#control_owner input:checked')
        .each(function() {
            filters[1].push(this.name);
        });

    d3.selectAll('#control_altitude input:checked')
        .each(function() {
            filters[2].push(this.name);
        });
    
    dimensions[1] = owners.filter((d) => filters[1].includes(d)).slice(0, 3);
    dimensions[1].push('outros');

    labels = dimensions[dimension];

    loadLegend();
    renderScatter();
}