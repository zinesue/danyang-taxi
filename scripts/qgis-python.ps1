param([Parameter(ValueFromRemainingArguments=$true)][string[]]$PythonArgs)
$ErrorActionPreference = 'Stop'
$qgisRoot = 'C:\Program Files\QGIS 3.40.12'
$env:PATH = "$qgisRoot\bin;$qgisRoot\apps\Python312;" + $env:PATH
$env:PROJ_DATA = "$qgisRoot\share\proj"
$env:GDAL_DATA = "$qgisRoot\apps\gdal\share\gdal"
$env:PYTHONIOENCODING = 'utf-8'
& "$qgisRoot\apps\Python312\python.exe" @PythonArgs
exit $LASTEXITCODE
