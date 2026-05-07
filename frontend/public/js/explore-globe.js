/* ═══════════════════════════════════════════════════════════════════════════
   ExploreX — Globe (Three.js)
   Real-Earth blue-marble texture + bump/specular maps, brighter lighting.
   Country markers = white glowing pin-spikes (thin cones pointing outward),
   no colored dots, no halos, only a subtle opacity pulse.
   Click a pin → fly camera + open the side panel with country data + AI places.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const COUNTRIES = [
    { name:'Afghanistan',    lat:33.9391,  lng:67.7100   },
    { name:'Albania',        lat:41.1533,  lng:20.1683   },
    { name:'Algeria',        lat:28.0339,  lng:1.6596    },
    { name:'Argentina',      lat:-38.4161, lng:-63.6167  },
    { name:'Armenia',        lat:40.0691,  lng:45.0382   },
    { name:'Australia',      lat:-25.2744, lng:133.7751  },
    { name:'Austria',        lat:47.5162,  lng:14.5501   },
    { name:'Azerbaijan',     lat:40.1431,  lng:47.5769   },
    { name:'Bahrain',        lat:26.0275,  lng:50.5500   },
    { name:'Bangladesh',     lat:23.6850,  lng:90.3563   },
    { name:'Belarus',        lat:53.7098,  lng:27.9534   },
    { name:'Belgium',        lat:50.5039,  lng:4.4699    },
    { name:'Belize',         lat:17.1899,  lng:-88.4976  },
    { name:'Benin',          lat:9.3077,   lng:2.3158    },
    { name:'Bolivia',        lat:-16.2902, lng:-63.5887  },
    { name:'Bosnia',         lat:43.9159,  lng:17.6791   },
    { name:'Botswana',       lat:-22.3285, lng:24.6849   },
    { name:'Brazil',         lat:-14.2350, lng:-51.9253  },
    { name:'Bulgaria',       lat:42.7339,  lng:25.4858   },
    { name:'Burkina Faso',   lat:12.3641,  lng:-1.5330   },
    { name:'Cambodia',       lat:12.5657,  lng:104.9910  },
    { name:'Cameroon',       lat:7.3697,   lng:12.3547   },
    { name:'Canada',         lat:56.1304,  lng:-106.3468 },
    { name:'Chile',          lat:-35.6751, lng:-71.5430  },
    { name:'China',          lat:35.8617,  lng:104.1954  },
    { name:'Colombia',       lat:4.5709,   lng:-74.2973  },
    { name:'Congo',          lat:-0.2280,  lng:15.8277   },
    { name:'Costa Rica',     lat:9.7489,   lng:-83.7534  },
    { name:'Croatia',        lat:45.1000,  lng:15.2000   },
    { name:'Cuba',           lat:21.5218,  lng:-77.7812  },
    { name:'Czech Republic', lat:49.8175,  lng:15.4730   },
    { name:'Denmark',        lat:56.2639,  lng:9.5018    },
    { name:'Dominican Rep.', lat:18.7357,  lng:-70.1627  },
    { name:'Ecuador',        lat:-1.8312,  lng:-78.1834  },
    { name:'Egypt',          lat:26.8206,  lng:30.8025   },
    { name:'Ethiopia',       lat:9.1450,   lng:40.4897   },
    { name:'Finland',        lat:61.9241,  lng:25.7482   },
    { name:'France',         lat:46.2276,  lng:2.2137    },
    { name:'Georgia',        lat:42.3154,  lng:43.3569   },
    { name:'Germany',        lat:51.1657,  lng:10.4515   },
    { name:'Ghana',          lat:7.9465,   lng:-1.0232   },
    { name:'Greece',         lat:39.0742,  lng:21.8243   },
    { name:'Guatemala',      lat:15.7835,  lng:-90.2308  },
    { name:'Honduras',       lat:15.1999,  lng:-86.2419  },
    { name:'Hungary',        lat:47.1625,  lng:19.5033   },
    { name:'Iceland',        lat:64.9631,  lng:-19.0208  },
    { name:'India',          lat:20.5937,  lng:78.9629   },
    { name:'Indonesia',      lat:-0.7893,  lng:113.9213  },
    { name:'Iran',           lat:32.4279,  lng:53.6880   },
    { name:'Iraq',           lat:33.2232,  lng:43.6793   },
    { name:'Ireland',        lat:53.4129,  lng:-8.2439   },
    { name:'Israel',         lat:31.0461,  lng:34.8516   },
    { name:'Italy',          lat:41.8719,  lng:12.5674   },
    { name:'Jamaica',        lat:18.1096,  lng:-77.2975  },
    { name:'Japan',          lat:36.2048,  lng:138.2529  },
    { name:'Jordan',         lat:30.5852,  lng:36.2384   },
    { name:'Kazakhstan',     lat:48.0196,  lng:66.9237   },
    { name:'Kenya',          lat:-0.0236,  lng:37.9062   },
    { name:'Kuwait',         lat:29.3117,  lng:47.4818   },
    { name:'Kyrgyzstan',     lat:41.2044,  lng:74.7661   },
    { name:'Laos',           lat:19.8563,  lng:102.4955  },
    { name:'Lebanon',        lat:33.8547,  lng:35.8623   },
    { name:'Libya',          lat:26.3351,  lng:17.2283   },
    { name:'Lithuania',      lat:55.1694,  lng:23.8813   },
    { name:'Madagascar',     lat:-18.7669, lng:46.8691   },
    { name:'Malaysia',       lat:4.2105,   lng:101.9758  },
    { name:'Maldives',       lat:3.2028,   lng:73.2207   },
    { name:'Mali',           lat:17.5707,  lng:-3.9962   },
    { name:'Mexico',         lat:23.6345,  lng:-102.5528 },
    { name:'Moldova',        lat:47.4116,  lng:28.3699   },
    { name:'Mongolia',       lat:46.8625,  lng:103.8467  },
    { name:'Montenegro',     lat:42.7087,  lng:19.3744   },
    { name:'Morocco',        lat:31.7917,  lng:-7.0926   },
    { name:'Mozambique',     lat:-18.6657, lng:35.5296   },
    { name:'Myanmar',        lat:21.9162,  lng:95.9560   },
    { name:'Namibia',        lat:-22.9576, lng:18.4904   },
    { name:'Nepal',          lat:28.3949,  lng:84.1240   },
    { name:'Netherlands',    lat:52.1326,  lng:5.2913    },
    { name:'New Zealand',    lat:-40.9006, lng:174.8860  },
    { name:'Nicaragua',      lat:12.8654,  lng:-85.2072  },
    { name:'Niger',          lat:17.6078,  lng:8.0817    },
    { name:'Nigeria',        lat:9.0820,   lng:8.6753    },
    { name:'North Korea',    lat:40.3399,  lng:127.5101  },
    { name:'Norway',         lat:60.4720,  lng:8.4689    },
    { name:'Oman',           lat:21.4735,  lng:55.9754   },
    { name:'Pakistan',       lat:30.3753,  lng:69.3451   },
    { name:'Panama',         lat:8.5379,   lng:-80.7821  },
    { name:'Papua N.G.',     lat:-6.3150,  lng:143.9555  },
    { name:'Paraguay',       lat:-23.4425, lng:-58.4438  },
    { name:'Peru',           lat:-9.1900,  lng:-75.0152  },
    { name:'Philippines',    lat:12.8797,  lng:121.7740  },
    { name:'Poland',         lat:51.9194,  lng:19.1451   },
    { name:'Portugal',       lat:39.3999,  lng:-8.2245   },
    { name:'Qatar',          lat:25.3548,  lng:51.1839   },
    { name:'Romania',        lat:45.9432,  lng:24.9668   },
    { name:'Russia',         lat:61.5240,  lng:105.3188  },
    { name:'Rwanda',         lat:-1.9403,  lng:29.8739   },
    { name:'Saudi Arabia',   lat:23.8859,  lng:45.0792   },
    { name:'Senegal',        lat:14.4974,  lng:-14.4524  },
    { name:'Serbia',         lat:44.0165,  lng:21.0059   },
    { name:'Singapore',      lat:1.3521,   lng:103.8198  },
    { name:'Slovakia',       lat:48.6690,  lng:19.6990   },
    { name:'Slovenia',       lat:46.1512,  lng:14.9955   },
    { name:'Somalia',        lat:5.1521,   lng:46.1996   },
    { name:'South Africa',   lat:-30.5595, lng:22.9375   },
    { name:'South Korea',    lat:35.9078,  lng:127.7669  },
    { name:'South Sudan',    lat:6.8770,   lng:31.3070   },
    { name:'Spain',          lat:40.4637,  lng:-3.7492   },
    { name:'Sri Lanka',      lat:7.8731,   lng:80.7718   },
    { name:'Sudan',          lat:12.8628,  lng:30.2176   },
    { name:'Sweden',         lat:60.1282,  lng:18.6435   },
    { name:'Switzerland',    lat:46.8182,  lng:8.2275    },
    { name:'Syria',          lat:34.8021,  lng:38.9968   },
    { name:'Taiwan',         lat:23.6978,  lng:120.9605  },
    { name:'Tajikistan',     lat:38.8610,  lng:71.2761   },
    { name:'Tanzania',       lat:-6.3690,  lng:34.8888   },
    { name:'Thailand',       lat:15.8700,  lng:100.9925  },
    { name:'Togo',           lat:8.6195,   lng:0.8248    },
    { name:'Tunisia',        lat:33.8869,  lng:9.5375    },
    { name:'Turkey',         lat:38.9637,  lng:35.2433   },
    { name:'Turkmenistan',   lat:38.9697,  lng:59.5563   },
    { name:'UAE',            lat:23.4241,  lng:53.8478   },
    { name:'Uganda',         lat:1.3733,   lng:32.2903   },
    { name:'Ukraine',        lat:48.3794,  lng:31.1656   },
    { name:'United Kingdom', lat:55.3781,  lng:-3.4360   },
    { name:'Uruguay',        lat:-32.5228, lng:-55.7658  },
    { name:'USA',            lat:37.0902,  lng:-95.7129  },
    { name:'Uzbekistan',     lat:41.3775,  lng:64.5853   },
    { name:'Venezuela',      lat:6.4238,   lng:-66.5897  },
    { name:'Vietnam',        lat:14.0583,  lng:108.2772  },
    { name:'Yemen',          lat:15.5527,  lng:48.5164   },
    { name:'Zambia',         lat:-13.1339, lng:27.8493   },
    { name:'Zimbabwe',       lat:-19.0154, lng:29.1549   },
  ];

  const RADIUS = 120;
  let scene, camera, renderer, controls, earthMesh, raycaster, mouse;
  let activeCountry = null;
  let hoveredFeature = null;
  let countriesGeoJSON = null;

  document.addEventListener('app:ready', () => { initGlobe(); bindGlobalEvents(); renderFeaturedList(); });

  function initGlobe() {
    const container = document.getElementById('globe-canvas');
    const W = container.clientWidth, H = container.clientHeight;

    scene  = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 2000);
    camera.position.set(0, 0, 460);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (THREE.ACESFilmicToneMapping !== undefined) renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    if (THREE.SRGBColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    /* ── Lighting — soft, even, matte. No specular glare. ─── */
    scene.add(new THREE.AmbientLight(0xfff5e8, 1.55));
    const key = new THREE.DirectionalLight(0xffe9c8, 1.4);
    key.position.set(-2.5, 2, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc9dffb, 0.7);
    fill.position.set(3, -1, -2);
    scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xfff0d6, 0xeaf2ff, 0.55));

    /* ── Earth: natural-color PBR with bump & water-roughness, no specular glare ─── */
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';

    const onTextureLoad = () => {
      const ld = document.getElementById('globe-loader');
      if (ld) ld.classList.add('gone');
    };

    const dayMap = loader.load(
      'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
      onTextureLoad, undefined, onTextureLoad
    );
    if (THREE.SRGBColorSpace !== undefined) dayMap.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding !== undefined) dayMap.encoding = THREE.sRGBEncoding;

    const bumpMap  = loader.load('https://unpkg.com/three-globe/example/img/earth-topology.png');
    const waterMap = loader.load('https://unpkg.com/three-globe/example/img/earth-water.png');

    earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 128, 128),
      new THREE.MeshStandardMaterial({
        map:           dayMap,
        bumpMap:       bumpMap,
        bumpScale:     1.4,
        roughnessMap:  waterMap,
        roughness:     0.95,
        metalness:     0.0,
      })
    );
    scene.add(earthMesh);

    /* ── Country highlight overlay ──────────────────────────────────────────
       A second sphere, slightly larger than Earth, with a transparent canvas
       texture. We draw the GeoJSON country polygons onto the canvas in
       equirectangular projection, with the hovered country filled in teal.
       This is the trick that makes "country highlight on hover" possible
       without any extra 3D libraries — just a 2D canvas synced to a sphere. */
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width  = 2048;
    overlayCanvas.height = 1024;
    const overlayCtx = overlayCanvas.getContext('2d');
    const overlayTexture = new THREE.CanvasTexture(overlayCanvas);
    overlayTexture.minFilter = THREE.LinearFilter;
    overlayTexture.magFilter = THREE.LinearFilter;
    if (THREE.SRGBColorSpace !== undefined) overlayTexture.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding !== undefined) overlayTexture.encoding = THREE.sRGBEncoding;

    const overlayMesh = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.002, 128, 128),  // a hair bigger so it sits on top
      new THREE.MeshBasicMaterial({
        map: overlayTexture,
        transparent: true,
        depthWrite: false,
      })
    );
    scene.add(overlayMesh);

    // Stash for later redraw on hover
    earthMesh.userData.overlay = { canvas: overlayCanvas, ctx: overlayCtx, texture: overlayTexture };

    /* Atmosphere — soft pale blue, low intensity */
    const atmoMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false,
      uniforms: { c: { value: 0.6 }, p: { value: 5.5 }, glowColor: { value: new THREE.Color(0xa8c8e8) } },
      vertexShader: 'varying vec3 vNormal; void main(){ vNormal=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 glowColor; uniform float c; uniform float p; varying vec3 vNormal; void main(){ float intensity=pow(c-dot(vNormal,vec3(0,0,1)),p); gl_FragColor=vec4(glowColor,1.)*intensity*0.55; }',
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.045, 64, 64), atmoMat));

    /* ── Load country polygons (GeoJSON) and pre-render the overlay ─── */
    const COUNTRIES_GEOJSON_URL =
      'https://raw.githubusercontent.com/vasturiano/three-globe/master/example/country-polygons/ne_110m_admin_0_countries.geojson';
    fetch(COUNTRIES_GEOJSON_URL)
      .then(r => r.json())
      .then(geo => { countriesGeoJSON = geo; redrawOverlay(); })
      .catch(err => console.warn('Could not load country polygons:', err));

    /* Stars */
    const starsGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000; i++) {
      const r = 700 + Math.random() * 400;
      const t = Math.random() * Math.PI * 2;
      const f = Math.acos(2 * Math.random() - 1);
      starPos[i * 3]     = r * Math.sin(f) * Math.cos(t);
      starPos[i * 3 + 1] = r * Math.cos(f);
      starPos[i * 3 + 2] = r * Math.sin(f) * Math.sin(t);
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, transparent: true, opacity: 0.6 })));

    /* Controls */
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping   = true;
    controls.dampingFactor   = 0.06;
    controls.enablePan       = false;
    controls.minDistance     = 200;
    controls.maxDistance     = 600;
    controls.rotateSpeed     = 0.55;
    controls.autoRotate      = true;
    controls.autoRotateSpeed = 0.6;

    raycaster = new THREE.Raycaster();
    mouse     = new THREE.Vector2();

    renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; });
    renderer.domElement.addEventListener('pointerup',   () => { if (!activeCountry) controls.autoRotate = true; });
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('pointermove', onCanvasMove);
    renderer.domElement.addEventListener('pointerleave', () => setHover(null));
    window.addEventListener('resize', onResize);
    animate();
  }

  function latLngToVec3(lat, lng, r) {
    const phi   = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(theta)
    );
  }

  function onResize() {
    const c = document.getElementById('globe-canvas');
    if (!c) return;
    camera.aspect = c.clientWidth / c.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(c.clientWidth, c.clientHeight);
  }

  /* ── Hit-test against the globe sphere, then locate which country
       polygon contains the lat/lng under the cursor. ─── */
  function pickCountryAt(clientX, clientY) {
    if (!countriesGeoJSON || !earthMesh) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x =  ((clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Raycast against the Earth sphere itself
    const hits = raycaster.intersectObject(earthMesh, false);
    if (!hits.length) return null;

    // Convert the world-space hit into lat/lng
    const localPt = earthMesh.worldToLocal(hits[0].point.clone()).normalize();
    // Sphere geometry mapping: phi = (90 - lat) * deg, theta = (lng + 180) * deg
    //   x = -sin(phi)*cos(theta)
    //   y =  cos(phi)
    //   z =  sin(phi)*sin(theta)
    const lat = 90 - Math.acos(Math.max(-1, Math.min(1, localPt.y))) * 180 / Math.PI;
    const lng = ((Math.atan2(localPt.z, -localPt.x) * 180 / Math.PI) - 180 + 540) % 360 - 180;

    return countriesGeoJSON.features.find(f => pointInFeature([lng, lat], f)) || null;
  }

  function pointInFeature(pt, feature) {
    const geom = feature.geometry;
    if (!geom) return false;
    if (geom.type === 'Polygon') return pointInPolygon(pt, geom.coordinates);
    if (geom.type === 'MultiPolygon') return geom.coordinates.some(poly => pointInPolygon(pt, poly));
    return false;
  }
  function pointInPolygon(pt, rings) {
    // Outer ring at index 0; inner rings (holes) at 1..n.
    if (!pointInRing(pt, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(pt, rings[i])) return false;
    }
    return true;
  }
  function pointInRing(pt, ring) {
    let inside = false;
    const x = pt[0], y = pt[1];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function setHover(feature) {
    if (hoveredFeature === feature) return;
    hoveredFeature = feature;
    redrawOverlay();
    // Pause auto-rotation while a country is being hovered. Resume when
    // hover clears, unless a country is selected (modal/scene open).
    if (controls) {
      if (feature) {
        controls.autoRotate = false;
      } else if (!activeCountry) {
        controls.autoRotate = true;
      }
    }
    const tip = document.getElementById('country-tooltip');
    if (!tip) return;
    if (feature) {
      const name = (feature.properties && (feature.properties.NAME || feature.properties.ADMIN || feature.properties.name)) || '';
      tip.textContent = name;
      tip.classList.add('show');
      renderer.domElement.style.cursor = 'pointer';
    } else {
      tip.classList.remove('show');
      renderer.domElement.style.cursor = '';
    }
  }

  /* ── Redraw the country-overlay canvas. Empty by default; the hovered
       country is filled with a soft teal tint. Equirectangular projection:
       x = (lng + 180) / 360 * width
       y = (90 - lat)  / 180 * height
       Note we render every frame as a fresh canvas (no transparency layering)
       so the overlay stays sharp. ─── */
  function redrawOverlay() {
    if (!earthMesh || !earthMesh.userData.overlay) return;
    const { canvas, ctx, texture } = earthMesh.userData.overlay;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (hoveredFeature && countriesGeoJSON) {
      ctx.fillStyle   = 'rgba(110, 173, 173, 0.45)';
      ctx.strokeStyle = 'rgba(79, 133, 133, 0.95)';
      ctx.lineWidth   = 2;
      ctx.lineJoin    = 'round';
      const drawPoly = (poly) => {
        // poly is [outerRing, hole1, hole2, …]
        ctx.beginPath();
        poly.forEach((ring) => {
          ring.forEach(([lng, lat], i) => {
            const x = ((lng + 180) / 360) * W;
            const y = ((90  - lat)  / 180) * H;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.closePath();
        });
        ctx.fill('evenodd');
        ctx.stroke();
      };
      const geom = hoveredFeature.geometry;
      if (geom) {
        if (geom.type === 'Polygon')           drawPoly(geom.coordinates);
        else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(drawPoly);
      }
    }

    texture.needsUpdate = true;
  }

  function onCanvasMove(e) {
    const tip = document.getElementById('country-tooltip');
    if (tip) {
      // Position tooltip relative to the globe-canvas container (its parent)
      const rect = renderer.domElement.getBoundingClientRect();
      const parentRect = tip.parentElement.getBoundingClientRect();
      tip.style.left = (e.clientX - parentRect.left) + 'px';
      tip.style.top  = (e.clientY - parentRect.top)  + 'px';
    }
    const f = pickCountryAt(e.clientX, e.clientY);
    setHover(f);
  }

  function onCanvasClick(e) {
    const f = pickCountryAt(e.clientX, e.clientY);
    if (!f) return;
    // Match the GeoJSON feature against our COUNTRIES list (by name).
    const name = (f.properties && (f.properties.NAME || f.properties.ADMIN || f.properties.name)) || '';
    const c = COUNTRIES.find(x => sameName(x.name, name)) || guessFallbackCountry(name);
    if (c) selectCountry(c);
  }

  function sameName(a, b) {
    if (!a || !b) return false;
    const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
    return norm(a) === norm(b);
  }
  // Friendly aliases so a few well-known country naming differences still work.
  function guessFallbackCountry(name) {
    const ALIASES = {
      'United States of America': 'USA',
      'United States':            'USA',
      'United Arab Emirates':     'UAE',
      'Russian Federation':       'Russia',
      'Czechia':                  'Czech Republic',
      'Republic of Korea':        'South Korea',
      'Korea, South':             'South Korea',
      'Korea, North':             'North Korea',
      'Viet Nam':                 'Vietnam',
      'Lao PDR':                  'Laos',
      'Myanmar':                  'Myanmar',
      'Burma':                    'Myanmar',
      'Bosnia and Herz.':         'Bosnia',
      'Dominican Republic':       'Dominican Rep.',
    };
    const looked = ALIASES[name];
    if (looked) return COUNTRIES.find(x => x.name === looked);
    return null;
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  /* ── Country select / camera fly + side panel ────────────────────────── */
  function selectCountry(country) {
    activeCountry = country;
    controls.autoRotate = false;
    const titleEl = document.getElementById('stage-title');
    if (titleEl) titleEl.classList.add('hidden-state');
    const featured = document.getElementById('featured-list');
    if (featured) featured.classList.add('hidden-state');

    const target = latLngToVec3(country.lat, country.lng, 250);
    if (window.gsap) {
      gsap.to(camera.position, {
        x: target.x, y: target.y, z: target.z,
        duration: 1.6, ease: 'power3.inOut',
        onUpdate: () => camera.lookAt(0, 0, 0),
      });
    } else {
      camera.position.set(target.x, target.y, target.z);
      camera.lookAt(0, 0, 0);
    }
    renderCountryPanel(country);
  }
  window.selectCountry = selectCountry;

  function renderFeaturedList() {
    const el = document.getElementById('featured-list');
    if (!el) return;
    const featured = ['France','Japan','Italy','Greece','UAE','USA','India','Morocco','United Kingdom'];
    const FLAG_CC = {
      'France': 'fr', 'Japan': 'jp', 'Italy': 'it', 'Greece': 'gr',
      'UAE': 'ae', 'USA': 'us', 'India': 'in', 'Morocco': 'ma',
      'United Kingdom': 'gb',
    };
    el.innerHTML = '<div class="lab">Featured</div>' +
      featured.map(name => {
        const c = COUNTRIES.find(x => x.name === name);
        if (!c) return '';
        const cc = FLAG_CC[name];
        const flag = cc
          ? '<img class="flag" src="https://flagcdn.com/w40/' + cc + '.png" alt="" loading="lazy">'
          : '<span class="dot" style="background:#fafafa;border:1px solid rgba(0,0,0,.15)"></span>';
        return '<button data-name="' + name + '">' + flag + name + '</button>';
      }).join('');
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const c = COUNTRIES.find(x => x.name === b.dataset.name);
      if (c) selectCountry(c);
    }));
  }

  /* ── Side panel rendering ────────────────────────────────────────────── */
  function renderCountryPanel(country) {
    const panel = document.getElementById('dest-panel');
    panel.innerHTML =
      '<div class="body" style="padding-top:0">' +
        '<button class="close" id="panel-close-btn"><i data-lucide="x" style="width:16px;height:16px"></i></button>' +
        '<div class="country-lab">Country</div>' +
        '<h2 style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">' +
          '<span id="country-flag-span"></span>' + escHtml(country.name) +
        '</h2>' +
        '<div id="ctry-loader" style="display:flex;align-items:center;gap:.75rem;margin-top:1.25rem;color:var(--ex-muted);font-size:.82rem">' +
          '<span style="width:18px;height:18px;border-radius:50%;background:var(--primary);opacity:.55;display:inline-block;animation:pulse 1.4s infinite ease-in-out"></span>' +
          'Loading details…' +
        '</div>' +
        '<div id="ctry-content"></div>' +
      '</div>';
    panel.classList.add('open');
    if (window.lucide) lucide.createIcons();
    panel.querySelector('#panel-close-btn').addEventListener('click', closePanel);

    loadCountryInfo(country);
    loadCountryPlaces(country);
  }

  async function loadCountryInfo(country) {
    try {
      const info = await window.db.integrations.country(country.name);
      const flagEl = document.getElementById('country-flag-span');
      if (flagEl && info && info.flag) {
        flagEl.innerHTML = '<img src="' + escHtml(info.flag) + '" style="height:22px;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.15)" alt="flag">';
      }
      if (!info) return;
      let meta = '';
      if (info.capital)    meta += '<span><i data-lucide="map-pin" style="width:13px;height:13px;display:inline-block;vertical-align:middle"></i> ' + escHtml(info.capital) + '</span>';
      if (info.region)     meta += '<span><i data-lucide="globe-2" style="width:13px;height:13px;display:inline-block;vertical-align:middle"></i> ' + escHtml(info.region) + '</span>';
      if (info.population) meta += '<span><i data-lucide="users" style="width:13px;height:13px;display:inline-block;vertical-align:middle"></i> ' + fmtPop(info.population) + '</span>';
      if (info.best_time)  meta += '<span><i data-lucide="calendar" style="width:13px;height:13px;display:inline-block;vertical-align:middle"></i> ' + escHtml(info.best_time) + '</span>';
      if (info.currency)   meta += '<span><i data-lucide="credit-card" style="width:13px;height:13px;display:inline-block;vertical-align:middle"></i> ' + escHtml(info.currency) + '</span>';
      if (info.languages)  meta += '<span><i data-lucide="message-circle" style="width:13px;height:13px;display:inline-block;vertical-align:middle"></i> ' + escHtml(info.languages) + '</span>';
      if (meta) {
        const content = document.getElementById('ctry-content');
        if (content) {
          const row = document.createElement('div');
          row.className = 'meta-row'; row.style.flexWrap = 'wrap'; row.style.gap = '.5rem .9rem'; row.style.fontSize = '.75rem';
          row.innerHTML = meta;
          content.insertAdjacentElement('afterbegin', row);
          if (window.lucide) lucide.createIcons();
        }
      }
    } catch (e) { /* ignore */ }
  }

  async function loadCountryPlaces(country) {
    try {
      const data = await window.db.integrations.countryPlaces(country.name);
      const loader = document.getElementById('ctry-loader');
      if (loader) loader.remove();
      renderDetails(country, data);
    } catch (e) {
      const loader = document.getElementById('ctry-loader');
      if (loader) loader.textContent = 'Could not load details.';
    }
  }

  function renderDetails(country, data) {
    const content = document.getElementById('ctry-content');
    if (!content) return;
    let html = '';

    if (data.overview) html += '<p class="tagline" style="margin-top:.75rem">' + escHtml(data.overview) + '</p>';

    if (data.highlights && data.highlights.length) {
      html += '<div class="tags" style="margin-top:.875rem">';
      data.highlights.forEach(h => { html += '<span class="tag">' + escHtml(h) + '</span>'; });
      html += '</div>';
    }

    html += '<div class="divider"></div>';

    // Action buttons — links to Weather / Planner / Booking pre-filled with country
    html += '<div class="actions">' +
      '<a class="act-btn act-grad" href="/weather?city=' + encodeURIComponent(country.name) + '" style="background:linear-gradient(135deg,var(--primary) 0%,var(--accent) 100%);border:1px solid var(--teal-25)"><i data-lucide="cloud-sun" style="width:14px;height:14px"></i> Weather</a>' +
      '<a class="act-btn act-line" href="/planner?city=' + encodeURIComponent(country.name) + '"><i data-lucide="sparkles" style="width:14px;height:14px"></i> AI Plan a Trip</a>' +
      '<a class="act-btn act-line" href="/places?q=' + encodeURIComponent(country.name) + '"><i data-lucide="map-pin" style="width:14px;height:14px"></i> Browse & Book Places</a>' +
      '<a class="act-btn act-line" href="/bookings?new=1&country=' + encodeURIComponent(country.name) + '"><i data-lucide="calendar" style="width:14px;height:14px"></i> Plan Trip Dates</a>' +
      '</div>';

    if (data.places && data.places.length) {
      html += '<div class="divider"></div>';
      html += '<div style="color:var(--ex-muted);font-size:.6rem;letter-spacing:.25em;text-transform:uppercase;margin-bottom:.875rem"><i data-lucide="map-pin" style="width:11px;height:11px;display:inline-block;vertical-align:middle"></i> Top Places</div>';
      html += '<div style="display:flex;flex-direction:column;gap:.5rem">';
      data.places.forEach(place => {
        html += '<div style="display:flex;gap:.75rem;align-items:center;padding:.7rem;border-radius:12px;background:var(--ex-bg);border:1px solid var(--ex-border)">' +
          '<div style="width:52px;height:52px;border-radius:8px;flex-shrink:0;overflow:hidden;background:var(--teal-10);display:flex;align-items:center;justify-content:center;position:relative" class="place-thumb-wrap">' +
            '<img data-query="' + escHtml((place.unsplash_query || place.name) + ' ' + country.name) + '" class="lazy-place-img" style="width:100%;height:100%;object-fit:cover;display:none" alt="' + escHtml(place.name) + '">' +
            '<i data-lucide="' + typeIcon(place.type) + '" style="width:18px;height:18px;color:var(--primary)" class="thumb-icon"></i>' +
          '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:.825rem;font-weight:500;color:var(--ex-dark);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(place.name) + '</div>' +
            '<div style="font-size:.7rem;color:var(--ex-muted);margin-top:.15rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + escHtml(place.tagline || place.description || '') + '</div>' +
          '</div>' +
          '<a href="/places?q=' + encodeURIComponent(place.name) + '" class="act-btn act-line" style="padding:.35rem .6rem;font-size:.6rem;flex-shrink:0;text-decoration:none">View</a>' +
          '</div>';
      });
      html += '</div>';
    }

    if (data.things_to_do && data.things_to_do.length) {
      html += '<div class="divider"></div>';
      html += '<div style="color:var(--ex-muted);font-size:.6rem;letter-spacing:.25em;text-transform:uppercase;margin-bottom:.875rem"><i data-lucide="star" style="width:11px;height:11px;display:inline-block;vertical-align:middle"></i> Things To Do</div>';
      html += '<div style="display:flex;flex-direction:column;gap:.45rem">';
      data.things_to_do.forEach(thing => {
        const cc = { food:'#fb923c', adventure:'#34d399', culture:'#a78bfa', nature:'#22d3ee', nightlife:'#f472b6', shopping:'#fbbf24' }[thing.category] || 'var(--primary)';
        const pl = { budget:'$', moderate:'$$', premium:'$$$', luxury:'$$$$' }[thing.price_range] || '$$';
        html += '<div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .85rem;border-radius:12px;background:var(--ex-bg);border:1px solid var(--ex-border)">' +
          '<span style="width:7px;height:7px;border-radius:50%;background:' + cc + ';flex-shrink:0"></span>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:.8rem;font-weight:500;color:var(--ex-dark)">' + escHtml(thing.name) + '</div>' +
            '<div style="font-size:.7rem;color:var(--ex-muted);margin-top:.1rem">' + escHtml(thing.description || '') + '</div>' +
          '</div>' +
          '<span style="font-size:.65rem;color:var(--ex-muted);flex-shrink:0">' + pl + '</span>' +
          '</div>';
      });
      html += '</div>';
    }

    html += '<div style="height:1.5rem"></div>';
    content.innerHTML = html;
    if (window.lucide) lucide.createIcons();
    lazyLoadPlaceImages(content, country);
  }

  async function lazyLoadPlaceImages(container, country) {
    const imgs = container.querySelectorAll('.lazy-place-img');
    for (const img of imgs) {
      const query = (img.dataset.query || country.name).trim();
      try {
        const res = await window.db.integrations.photo(query);
        if (res && (res.thumb || res.url)) {
          img.src = res.thumb || res.url;
          img.onload = function () {
            img.style.display = 'block';
            const icon = img.parentElement.querySelector('.thumb-icon');
            if (icon) icon.style.display = 'none';
          };
        }
      } catch (e) { /* keep icon */ }
    }
  }

  function typeIcon(type) {
    return { city:'building-2', attraction:'compass', nature:'trees', beach:'waves', historical:'landmark' }[type] || 'map-pin';
  }
  function fmtPop(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return String(n);
  }
  function escHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }

  function closePanel() {
    activeCountry = null;
    const panel = document.getElementById('dest-panel');
    if (panel) panel.classList.remove('open');
    const title = document.getElementById('stage-title');
    if (title) title.classList.remove('hidden-state');
    const featured = document.getElementById('featured-list');
    if (featured) featured.classList.remove('hidden-state');
    controls.autoRotate = true;
    if (window.gsap) {
      gsap.to(camera.position, { x: 0, y: 0, z: 320, duration: 1.4, ease: 'power2.inOut', onUpdate: () => camera.lookAt(0, 0, 0) });
    } else {
      camera.position.set(0, 0, 320);
      camera.lookAt(0, 0, 0);
    }
  }
  window.closePanel = closePanel;

  function bindGlobalEvents() {
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
  }
})();
