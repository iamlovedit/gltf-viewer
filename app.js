import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// 全局变量
let scene, camera, renderer, controls;
let currentModel = null;
let mixer = null;
let clock = new THREE.Clock();
let ambientLight, directionalLight;
let rotationSpeed = 0;
let animations = [];
let sectionPlaneX = null, sectionPlaneY = null, sectionPlaneZ = null;

// 优化相关变量
let lodGroup = null;
let frustumCuller = null;
let stats = null;
let optimizationSettings = {
    enableLOD: true,
    enableFrustumCulling: true,
    enableInstancing: true,
    pixelRatio: window.devicePixelRatio,
    shadowMapSize: 2048
};

// 初始化场景
function init() {
    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a2a);
    scene.fog = new THREE.Fog(0x2a2a2a, 10, 500);

    // 添加性能监控
    addPerformanceMonitor();

    // 创建相机
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 100, 100);


    // 创建渲染器
    const canvas = document.getElementById('canvas');
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制最大像素比
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.sortObjects = false; // 提高渲染性能

    // 创建轨道控制器
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true; // 启用屏幕空间平移
    controls.minDistance = 0.1;
    controls.maxDistance = 500;
    controls.maxPolarAngle = Math.PI;

    // 设置鼠标按键映射
    // 左键：平移
    // 中键：旋转
    // 右键：缩放
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.DOLLY
    };

    // 触控板/触摸屏控制
    controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_ROTATE
    };

    // 添加灯光
    ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // 添加地面
    // const groundGeometry = new THREE.PlaneGeometry(100, 100);
    // const groundMaterial = new THREE.MeshStandardMaterial({
    //     color: 0x1a1a1a,
    //     roughness: 0.8,
    //     metalness: 0.2
    // });
    // const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    // ground.rotation.x = -Math.PI / 2;
    // ground.position.y = -0.01;
    // ground.receiveShadow = true;
    // scene.add(ground);

    // // 添加网格辅助线
    const gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
    scene.add(gridHelper);

    // 添加坐标轴辅助线
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // 设置事件监听器
    setupEventListeners();

    // 开始渲染循环
    animate();
}

// 设置事件监听器
function setupEventListeners() {
    // 文件输入
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', handleFileSelect);

    // 拖放支持
    const container = document.getElementById('container');
    const dropZone = document.getElementById('dropZone');

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('active');
    });

    container.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('active');
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('active');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            loadFile(files[0]);
        }
    });

    // 窗口调整
    window.addEventListener('resize', onWindowResize);

    // 控制滑块
    const lightIntensitySlider = document.getElementById('lightIntensity');
    lightIntensitySlider.addEventListener('input', (e) => {
        directionalLight.intensity = parseFloat(e.target.value);
    });

    const rotationSpeedSlider = document.getElementById('rotationSpeed');
    rotationSpeedSlider.addEventListener('input', (e) => {
        rotationSpeed = parseFloat(e.target.value);
    });

    // 自动旋转控制
    document.getElementById('autoRotate').addEventListener('change', (e) => {
        rotationSpeed = e.target.checked ? 0.01 : 0;
    });

    // 优化设置控制
    document.getElementById('enableLOD').addEventListener('change', (e) => {
        optimizationSettings.enableLOD = e.target.checked;
        console.log('LOD设置已更改:', e.target.checked);
    });

    document.getElementById('enableFrustumCulling').addEventListener('change', (e) => {
        optimizationSettings.enableFrustumCulling = e.target.checked;
        if (currentModel) {
            currentModel.traverse((node) => {
                if (node.isMesh) {
                    node.frustumCulled = e.target.checked;
                }
            });
        }
    });

    document.getElementById('pixelRatio').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('pixelRatioValue').textContent = value.toFixed(1);
        renderer.setPixelRatio(Math.min(value, 2));
    });

    document.getElementById('shadowQuality').addEventListener('change', (e) => {
        const size = parseInt(e.target.value);
        optimizationSettings.shadowMapSize = size;

        // 更新阴影贴图大小
        if (directionalLight.shadow) {
            directionalLight.shadow.mapSize.width = size;
            directionalLight.shadow.mapSize.height = size;
            directionalLight.shadow.map?.dispose();
            directionalLight.shadow.map = null;
        }
    });

    // 键盘快捷键
    window.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'r':
            case 'R':
                resetCamera();
                break;
            case 'w':
            case 'W':
                toggleWireframe();
                break;
            case ' ':
                if (animations.length > 0 && mixer) {
                    animations.forEach(action => {
                        action.paused = !action.paused;
                    });
                }
                break;
        }
    });
}

// 文件选择处理
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        loadFile(file);
    }
}

// 加载文件
function loadFile(file) {
    const reader = new FileReader();
    const loadingIndicator = document.getElementById('loadingIndicator');

    loadingIndicator.style.display = 'block';

    reader.onload = function (e) {
        const arrayBuffer = e.target.result;
        const blob = new Blob([arrayBuffer]);
        const url = URL.createObjectURL(blob);

        loadGLTF(url, () => {
            URL.revokeObjectURL(url);
        });
    };

    reader.readAsArrayBuffer(file);
}

// 加载GLTF模型
function loadGLTF(url, onComplete) {
    const loader = new GLTFLoader();

    // 设置Draco解码器路径（可选，用于压缩的GLTF文件）
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(dracoLoader);

    loader.load(
        url,
        (gltf) => {
            // 移除之前的模型
            if (currentModel) {
                scene.remove(currentModel);
                currentModel = null;
            }

            // 添加新模型
            currentModel = gltf.scene;

            // 应用优化
            optimizeModel(currentModel);

            scene.add(currentModel);

            // 设置阴影和优化材质
            currentModel.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;

                    // 启用视锥体剔除
                    node.frustumCulled = true;

                    // 优化材质
                    if (node.material) {
                        optimizeMaterial(node.material);
                    }
                }
            });

            // 自动调整相机位置
            fitCameraToObject(currentModel);

            // 处理动画
            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(currentModel);
                animations = [];

                gltf.animations.forEach((clip) => {
                    const action = mixer.clipAction(clip);
                    action.play();
                    animations.push(action);
                });
            }

            // 更新模型信息
            updateModelInfo(gltf);

            // 隐藏加载指示器
            document.getElementById('loadingIndicator').style.display = 'none';

            if (onComplete) onComplete();
        },
        (progress) => {
            // 进度回调
            const percentComplete = (progress.loaded / progress.total) * 100;
            document.getElementById('loadingIndicator').textContent =
                `加载中... ${percentComplete.toFixed(0)}%`;
        },
        (error) => {
            console.error('加载模型时出错：', error);
            document.getElementById('loadingIndicator').style.display = 'none';
            alert('加载模型失败，请检查文件格式是否正确');
            if (onComplete) onComplete();
        }
    );
}

// 自动调整相机以适应对象
function fitCameraToObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.5;

    camera.position.set(
        center.x + cameraDistance,
        center.y + cameraDistance / 2,
        center.z + cameraDistance
    );

    camera.lookAt(center);
    controls.target = center;
    controls.update();
}

// 更新模型信息
function updateModelInfo(gltf) {
    const modelInfo = document.getElementById('modelInfo');
    const modelStats = document.getElementById('modelStats');

    let stats = '文件信息：<br>';

    // 计算顶点和三角形数量
    let totalVertices = 0;
    let totalTriangles = 0;
    let meshCount = 0;

    gltf.scene.traverse((node) => {
        if (node.isMesh) {
            meshCount++;
            if (node.geometry) {
                totalVertices += node.geometry.attributes.position.count;
                if (node.geometry.index) {
                    totalTriangles += node.geometry.index.count / 3;
                } else {
                    totalTriangles += node.geometry.attributes.position.count / 3;
                }
            }
        }
    });

    stats += `- 网格数量: ${meshCount}<br>`;
    stats += `- 顶点数: ${totalVertices.toLocaleString()}<br>`;
    stats += `- 三角形数: ${Math.floor(totalTriangles).toLocaleString()}<br>`;

    if (gltf.animations && gltf.animations.length > 0) {
        stats += `- 动画数量: ${gltf.animations.length}<br>`;
        stats += '- 动画名称:<br>';
        gltf.animations.forEach((clip, index) => {
            stats += `  ${index + 1}. ${clip.name || '未命名动画'}<br>`;
        });
    }

    modelStats.innerHTML = stats;
    modelInfo.style.display = 'block';
}

// 重置相机视角
window.resetCamera = function () {
    if (currentModel) {
        fitCameraToObject(currentModel);
    } else {
        camera.position.set(0, 100, 100);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();
    }
};

// 切换线框模式
window.toggleWireframe = function () {
    if (currentModel) {
        currentModel.traverse((node) => {
            if (node.isMesh && node.material) {
                node.material.wireframe = !node.material.wireframe;
            }
        });
    }
};

// 窗口大小调整
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// 动画循环
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // 更新动画混合器
    if (mixer) {
        mixer.update(delta);
    }

    // 自动旋转
    if (currentModel && rotationSpeed > 0) {
        currentModel.rotation.y += rotationSpeed;
    }

    // 更新LOD（如果使用）
    if (currentModel && currentModel.isLOD) {
        currentModel.update(camera);
    }

    // 更新控制器
    controls.update();

    // 渲染场景
    renderer.render(scene, camera);

    // 更新性能统计
    //updatePerformanceStats();
}

// 初始化应用
init();

// 优化模型
function optimizeModel(model) {
    const modelStats = analyzeModel(model);

    // 如果三角形数量超过阈值，应用LOD
    if (modelStats.totalTriangles > 100000 && optimizationSettings.enableLOD) {
        createLOD(model);
    }

    // 合并相同材质的几何体
    mergeBufferGeometries(model);

    // 优化几何体
    model.traverse((node) => {
        if (node.isMesh && node.geometry) {
            optimizeGeometry(node.geometry);
        }
    });
}

// 分析模型统计信息
function analyzeModel(model) {
    let totalTriangles = 0;
    let totalVertices = 0;
    let meshCount = 0;

    model.traverse((node) => {
        if (node.isMesh && node.geometry) {
            meshCount++;
            totalVertices += node.geometry.attributes.position.count;
            if (node.geometry.index) {
                totalTriangles += node.geometry.index.count / 3;
            } else {
                totalTriangles += node.geometry.attributes.position.count / 3;
            }
        }
    });

    return { totalTriangles, totalVertices, meshCount };
}

// 创建LOD（细节层次）
function createLOD(model) {
    const lod = new THREE.LOD();

    // 原始高精度模型
    lod.addLevel(model.clone(), 0);

    // 中等精度模型（简化50%）
    const mediumModel = simplifyModel(model.clone(), 0.5);
    lod.addLevel(mediumModel, 50);

    // 低精度模型（简化80%）
    const lowModel = simplifyModel(model.clone(), 0.2);
    lod.addLevel(lowModel, 100);

    // 替换原始模型
    model.parent.add(lod);
    model.parent.remove(model);
    currentModel = lod;
}

// 简化模型（使用简单的顶点去重）
function simplifyModel(model, ratio) {
    model.traverse((node) => {
        if (node.isMesh && node.geometry) {
            // 这里使用简单的策略：减少渲染的三角形数量
            // 实际项目中可以使用 SimplifyModifier
            const geometry = node.geometry.clone();

            if (geometry.index) {
                const newIndexCount = Math.floor(geometry.index.count * ratio);
                const newIndices = geometry.index.array.slice(0, newIndexCount);
                geometry.setIndex(new THREE.BufferAttribute(newIndices, 1));
            }

            node.geometry = geometry;
        }
    });
    return model;
}

// 优化几何体
function optimizeGeometry(geometry) {
    // 计算法线（如果没有）
    if (!geometry.attributes.normal) {
        geometry.computeVertexNormals();
    }

    // 优化顶点数据
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    // 如果几何体太大，考虑分割
    const positionCount = geometry.attributes.position.count;
    if (positionCount > 65536) {
        // 对于大型几何体，确保使用32位索引
        if (!geometry.index) {
            const indices = [];
            for (let i = 0; i < positionCount; i++) {
                indices.push(i);
            }
            geometry.setIndex(indices);
        }
    }
}

// 优化材质
function optimizeMaterial(material) {
    // 降低贴图分辨率（如果太大）
    if (material.map && material.map.image) {
        const maxSize = 2048;
        if (material.map.image.width > maxSize || material.map.image.height > maxSize) {
            material.map.minFilter = THREE.LinearMipmapLinearFilter;
            material.map.generateMipmaps = true;
        }
    }

    // 禁用不必要的特性
    if (material.emissive && material.emissive.getHex() === 0x000000) {
        material.emissive = undefined;
        material.emissiveMap = undefined;
    }

    // 使用更简单的着色模型
    if (material.metalness === 0 && material.roughness === 1) {
        // 可以考虑使用 MeshLambertMaterial 代替 MeshStandardMaterial
    }

    // 启用材质缓存
    material.needsUpdate = false;
}

// 合并相同材质的几何体
function mergeBufferGeometries(model) {
    const geometriesByMaterial = new Map();

    model.traverse((node) => {
        if (node.isMesh && node.geometry && node.material) {
            const materialId = node.material.uuid;
            if (!geometriesByMaterial.has(materialId)) {
                geometriesByMaterial.set(materialId, []);
            }
            geometriesByMaterial.get(materialId).push({
                geometry: node.geometry,
                matrix: node.matrixWorld.clone()
            });
        }
    });

    // 合并具有相同材质的几何体
    geometriesByMaterial.forEach((geometries, materialId) => {
        if (geometries.length > 1) {
            // 使用 BufferGeometryUtils.mergeBufferGeometries
            // 这里简化处理，实际项目中应该使用 Three.js 的工具函数
            console.log(`可以合并 ${geometries.length} 个使用相同材质的几何体`);
        }
    });
}

// 添加性能监控
function addPerformanceMonitor() {
    // 创建FPS显示
    const statsContainer = document.createElement('div');
    statsContainer.style.position = 'absolute';
    statsContainer.style.top = '10px';
    statsContainer.style.width = '100px'
    statsContainer.style.height = '100px'
    statsContainer.style.right = '10px';
    statsContainer.style.color = 'white';
    statsContainer.style.fontFamily = 'monospace';
    statsContainer.style.fontSize = '12px';
    statsContainer.style.backgroundColor = 'rgba(0,0,0,0.5)';
    statsContainer.style.padding = '5px';
    statsContainer.id = 'performanceStats';
    document.body.appendChild(statsContainer);

    return statsContainer;
}

// 性能统计变量
let frameCount = 0;
let lastTime = performance.now();
let fps = 0;

// 更新性能统计
function updatePerformanceStats() {
    frameCount++;
    const currentTime = performance.now();

    // 每秒更新一次FPS
    if (currentTime >= lastTime + 1000) {
        fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        frameCount = 0;
        lastTime = currentTime;
    }

    const info = renderer.info;
    const statsElement = document.getElementById('performanceStats');
    if (statsElement) {
        const memory = info.memory;
        statsElement.innerHTML = `
            FPS: ${fps}<br>
            三角形: ${info.render.triangles.toLocaleString()}<br>
            Draw Calls: ${info.render.calls}<br>
            几何体: ${memory.geometries}<br>
            纹理: ${memory.textures}
        `;
    }
}

// 剖切工具栏按钮事件
document.getElementById('sectionX').addEventListener('click', () => {
    enableSectionPlane('x');
    showSectionBox('x');
});
document.getElementById('sectionY').addEventListener('click', () => {
    enableSectionPlane('y');
    showSectionBox('y');
});
document.getElementById('sectionZ').addEventListener('click', () => {
    enableSectionPlane('z');
    showSectionBox('z');
});
document.getElementById('resetSection').addEventListener('click', () => {
    resetSectionPlanes();
    hideSectionBox();
});

// 剖切框拖动与同步剖切平面
const sectionBox = document.getElementById('sectionBox');
let isDraggingSection = false;
let dragOffset = { x: 0, y: 0 };
let currentSectionAxis = null;

function showSectionBox(axis) {
    sectionBox.style.display = 'block';
    currentSectionAxis = axis;
    // 可根据需要调整初始位置和大小
}
function hideSectionBox() {
    sectionBox.style.display = 'none';
    currentSectionAxis = null;
}

sectionBox.addEventListener('mousedown', function (e) {
    isDraggingSection = true;
    dragOffset.x = e.clientX - sectionBox.offsetLeft;
    dragOffset.y = e.clientY - sectionBox.offsetTop;
    document.body.style.userSelect = 'none';
});
document.addEventListener('mousemove', function (e) {
    if (!isDraggingSection) return;
    let x = e.clientX - dragOffset.x;
    let y = e.clientY - dragOffset.y;
    // 限制拖动范围在container内
    const container = document.getElementById('container');
    x = Math.max(0, Math.min(container.clientWidth - sectionBox.offsetWidth, x));
    y = Math.max(0, Math.min(container.clientHeight - sectionBox.offsetHeight, y));
    sectionBox.style.left = x + 'px';
    sectionBox.style.top = y + 'px';
    updateSectionPlaneByBox();
});
document.addEventListener('mouseup', function () {
    isDraggingSection = false;
    document.body.style.userSelect = '';
});

function updateSectionPlaneByBox() {
    if (!currentSectionAxis) return;
    // 计算剖切平面的位置
    const container = document.getElementById('container');
    const boxRect = sectionBox.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    // 归一化到[-1,1]范围
    const relX = (boxRect.left + boxRect.width / 2 - containerRect.left) / containerRect.width;
    const relY = (boxRect.top + boxRect.height / 2 - containerRect.top) / containerRect.height;
    // 通过相机反投影到世界坐标
    let plane;
    switch (currentSectionAxis) {
        case 'x':
            // relX=0为最左，1为最右
            // 这里假设模型居中，剖切平面d取值范围[-maxX,maxX]
            if (currentModel) {
                const box = new THREE.Box3().setFromObject(currentModel);
                const maxX = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
                const d = -(relX * 2 - 1) * maxX;
                sectionPlaneX.constant = d;
                renderer.clippingPlanes = [sectionPlaneX];
            }
            break;
        case 'y':
            if (currentModel) {
                const box = new THREE.Box3().setFromObject(currentModel);
                const maxY = Math.max(Math.abs(box.min.y), Math.abs(box.max.y));
                const d = -(1 - relY * 2) * maxY;
                sectionPlaneY.constant = d;
                renderer.clippingPlanes = [sectionPlaneY];
            }
            break;
        case 'z':
            if (currentModel) {
                const box = new THREE.Box3().setFromObject(currentModel);
                const maxZ = Math.max(Math.abs(box.min.z), Math.abs(box.max.z));
                const d = -(relX * 2 - 1) * maxZ; // 用relX控制z轴剖切
                sectionPlaneZ.constant = d;
                renderer.clippingPlanes = [sectionPlaneZ];
            }
            break;
    }
}
function enableSectionPlane(axis) {
    resetSectionPlanes();
    let plane;
    switch (axis) {
        case 'x':
            sectionPlaneX = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
            plane = sectionPlaneX;
            break;
        case 'y':
            sectionPlaneY = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
            plane = sectionPlaneY;
            break;
        case 'z':
            sectionPlaneZ = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
            plane = sectionPlaneZ;
            break;
    }
    renderer.clippingPlanes = [plane];
}
function resetSectionPlanes() {
    sectionPlaneX = sectionPlaneY = sectionPlaneZ = null;
    renderer.clippingPlanes = [];
}

// 三维剖切盒相关变量
let sectionBoxHelper = null;
let sectionBoxPlanes = [];
let sectionBoxControls = [];
let sectionBoxMeshes = [];

function enableSectionBox() {
    if (!currentModel) return;
    // 移除旧的剖切盒和控件
    if (sectionBoxHelper) {
        scene.remove(sectionBoxHelper);
        sectionBoxPlanes = [];
        sectionBoxControls.forEach(ctrl => ctrl.dispose && ctrl.dispose());
        sectionBoxControls = [];
        sectionBoxMeshes.forEach(mesh => scene.remove(mesh));
        sectionBoxMeshes = [];
    }
    // 获取模型包围盒
    const box = new THREE.Box3().setFromObject(currentModel);
    // 创建BoxHelper
    sectionBoxHelper = new THREE.Box3Helper(box, 0xff9800);
    scene.add(sectionBoxHelper);
    // 创建六个clipping plane
    sectionBoxPlanes = [
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), -box.min.x), // left
        new THREE.Plane(new THREE.Vector3(1, 0, 0), box.max.x),   // right
        new THREE.Plane(new THREE.Vector3(0, -1, 0), -box.min.y), // bottom
        new THREE.Plane(new THREE.Vector3(0, 1, 0), box.max.y),   // top
        new THREE.Plane(new THREE.Vector3(0, 0, -1), -box.min.z), // back
        new THREE.Plane(new THREE.Vector3(0, 0, 1), box.max.z)    // front
    ];
    renderer.clippingPlanes = sectionBoxPlanes;
    renderer.localClippingEnabled = true;
    // 创建六个可拖动的透明面
    const faceConfigs = [
        { // left
            pos: [box.min.x, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2],
            size: [0.01, box.max.y - box.min.y, box.max.z - box.min.z],
            planeIdx: 0,
            normal: new THREE.Vector3(-1, 0, 0)
        },
        { // right
            pos: [box.max.x, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2],
            size: [0.01, box.max.y - box.min.y, box.max.z - box.min.z],
            planeIdx: 1,
            normal: new THREE.Vector3(1, 0, 0)
        },
        { // bottom
            pos: [(box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2],
            size: [box.max.x - box.min.x, 0.01, box.max.z - box.min.z],
            planeIdx: 2,
            normal: new THREE.Vector3(0, -1, 0)
        },
        { // top
            pos: [(box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2],
            size: [box.max.x - box.min.x, 0.01, box.max.z - box.min.z],
            planeIdx: 3,
            normal: new THREE.Vector3(0, 1, 0)
        },
        { // back
            pos: [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z],
            size: [box.max.x - box.min.x, box.max.y - box.min.y, 0.01],
            planeIdx: 4,
            normal: new THREE.Vector3(0, 0, -1)
        },
        { // front
            pos: [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z],
            size: [box.max.x - box.min.x, box.max.y - box.min.y, 0.01],
            planeIdx: 5,
            normal: new THREE.Vector3(0, 0, 1)
        }
    ];
    faceConfigs.forEach(cfg => {
        const geo = new THREE.BoxGeometry(cfg.size[0], cfg.size[1], cfg.size[2]);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00bfff, opacity: 0.2, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
        mesh.userData.planeIdx = cfg.planeIdx;
        scene.add(mesh);
        sectionBoxMeshes.push(mesh);
        // 拖动控件
        const ctrl = new TransformControls(camera, renderer.domElement);
        ctrl.attach(mesh);
        ctrl.setMode('translate');
        ctrl.showX = Math.abs(cfg.normal.x) === 1;
        ctrl.showY = Math.abs(cfg.normal.y) === 1;
        ctrl.showZ = Math.abs(cfg.normal.z) === 1;
        ctrl.addEventListener('objectChange', () => {
            // 拖动时同步更新clipping plane
            const idx = mesh.userData.planeIdx;
            // 计算新constant
            const worldPos = mesh.position.clone();
            sectionBoxPlanes[idx].constant = -cfg.normal.dot(worldPos);
        });
        scene.add(ctrl);
        sectionBoxControls.push(ctrl);
    });
}
function disableSectionBox() {
    if (sectionBoxHelper) {
        scene.remove(sectionBoxHelper);
        sectionBoxHelper = null;
    }
    sectionBoxPlanes = [];
    renderer.clippingPlanes = [];
    renderer.localClippingEnabled = false;
    sectionBoxControls.forEach(ctrl => ctrl.dispose && ctrl.dispose());
    sectionBoxControls = [];
    sectionBoxMeshes.forEach(mesh => scene.remove(mesh));
    sectionBoxMeshes = [];
}
// 剖切工具栏按钮事件重构
const sectionXBtn = document.getElementById('sectionX');
const sectionYBtn = document.getElementById('sectionY');
const sectionZBtn = document.getElementById('sectionZ');
const resetSectionBtn = document.getElementById('resetSection');
sectionXBtn.addEventListener('click', enableSectionBox);
sectionYBtn.addEventListener('click', enableSectionBox);
sectionZBtn.addEventListener('click', enableSectionBox);
resetSectionBtn.addEventListener('click', disableSectionBox);
