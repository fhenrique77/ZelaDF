param([Parameter(Mandatory=$true)][string]$ProjectRef)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $root
$projectsRaw=npx.cmd --offline --yes supabase@2 projects list --output json
if($LASTEXITCODE -ne 0){throw 'Cannot verify staging project'}
$project=($projectsRaw -join [Environment]::NewLine | ConvertFrom-Json) | Where-Object {$_.id -eq $ProjectRef}
if(-not $project -or $project.name -notmatch '(staging|test)'){throw 'Only a named staging/test project is allowed'}
$results=@()
foreach($testFile in Get-ChildItem (Join-Path $PSScriptRoot 'database/*.sql')){
  $sql=Get-Content -Raw -Encoding utf8 $testFile.FullName
  $sql=[regex]::Replace($sql,'(?im)^begin;', 'BEGIN; CREATE TEMP TABLE tap_output(seq bigint GENERATED ALWAYS AS IDENTITY,line text); GRANT ALL ON tap_output TO anon,authenticated,service_role; GRANT ALL ON SEQUENCE tap_output_seq_seq TO anon,authenticated,service_role;')
  $sql=[regex]::Replace($sql,'(?im)^select (has_table|results_eq|throws_ok|lives_ok|ok|is)\(', 'INSERT INTO tap_output(line) SELECT $1(')
  $sql=[regex]::Replace($sql,'(?im)^select \* from finish\(\);','INSERT INTO tap_output(line) SELECT * FROM finish(); SELECT line FROM tap_output ORDER BY seq;')
  $queryPath=Join-Path $root ('.tools/contract-'+$testFile.Name)
  [IO.File]::WriteAllText($queryPath,$sql,[Text.UTF8Encoding]::new($false))
  $raw=npx.cmd --offline --yes supabase@2 db query --linked --project-ref $ProjectRef --file $queryPath --output json
  if($LASTEXITCODE -ne 0){throw ('SQL execution failed: '+$testFile.Name)}
  $lines=@((($raw -join [Environment]::NewLine)|ConvertFrom-Json).rows | ForEach-Object {$_.line})
  $passed=@($lines|Where-Object {$_ -match '^ok '}).Count
  $failed=@($lines|Where-Object {$_ -notmatch '^ok '})
  $results+=[pscustomobject]@{file=$testFile.Name;passed=$passed;failures=$failed}
  Write-Output ($testFile.Name+': '+$passed+' passed; '+$failed.Count+' failures')
}
$results|ConvertTo-Json -Depth 5|Set-Content -Encoding utf8 (Join-Path $root '.tools/staging-contract-results.json')
if(@($results|Where-Object {$_.failures.Count -gt 0}).Count){$results|Where-Object {$_.failures.Count -gt 0}|ForEach-Object {$_.failures};exit 1}
