# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules

block_cipher = None

# Collect rasterio/GDAL/PROJ data and shared libs
rasterio_datas = collect_data_files('rasterio')
shapely_datas  = collect_data_files('shapely')
rasterio_bins  = collect_dynamic_libs('rasterio')
rasterio_mods  = collect_submodules('rasterio')

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=rasterio_bins,
    datas=rasterio_datas + shapely_datas,
    hiddenimports=rasterio_mods + [
        # services imported lazily inside endpoint functions
        'services.settlements',
        'services.rivers',
        'services.roads',
        'services.roads_v2',
        'services.rails',
        'services.rails_v2',
        'services.motorway_hexes',
        'services.map_image',
        'services.worldcover',
        'services.terrain',
        'services.osm',
        'services.overpass',
        'services.hex_grid',
        'services.geometry',
        'services.elevation_tiles',
        # shapely lazy imports
        'shapely.ops',
        'shapely.geometry',
        'shapely.geometry.polygon',
        # rasterio lazy imports
        'rasterio.transform',
        'rasterio.merge',
        'rasterio.enums',
        'rasterio.features',
        'rasterio.io',
        # uvicorn internals not picked up by static analysis
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.loops.uvloop',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        # misc
        'multipart',
        'email.mime.text',
        'email.mime.multipart',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'IPython', 'jupyter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='sidecar',
)
