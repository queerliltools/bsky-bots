#!/usr/bin/pwsh -NoProfile

[CmdletBinding()]
param(
	[Switch]$Refresh
)

begin {
	$APIKey = cat ../secrets/porkbun_api_key
	$SecretAPIKey = cat ../secrets/porkbun_secret_api_key
	$Domains = @('vgay.fyi', 'hasa.gripe', 'doeswet.work', 'tgirlat.work', 'tgirl.quest', 'tgirl.mom')
	$OutFile = '/tmp/handles_records.json'

	$StatusCode = 200
	$ResponseBody = $null # technically we don't have to set this, but i like keeping track
	$ShouldRefresh = $Refresh -or $env:QUERY_STRING -match 'refresh'
}

process {
	if (-NOT $ShouldRefresh) { $ResponseBody = Get-Content $OutFile }
	else {
		$DNSRecords = [Collections.Generic.List[PSCustomObject]]::new()
		$Domains.ForEach{
			$APIRequest = @{
				Uri = "https://api.porkbun.com/api/json/v3/dns/retrieve/$_"
				Method = 'POST'
				Body = ConvertTo-Json @{
					apikey = $APIKey
					secretapikey = $SecretAPIKey
				}
			}
			try { $APIResponse = Invoke-RestMethod @APIRequest }
			catch { $APIResponse = @{records=@()} }
			$APIResponse.records | Where-Object { $_.Type -eq 'TXT' -and $_.Name.StartsWith('_atproto.') } | ForEach-Object { $DNSRecords.Add([PSCustomObject]@{"$($_.Name.Replace('_atproto.', [string]::Empty))" = $_.Content.Replace('did=', [string]::Empty)}) }
		}
		$ResponseBody = $DNSRecords | ConvertTo-Json -Compress
		$null = $ResponseBody | Out-File $OutFile
	}
}


end {
	$ResponseHeaders = @(
		"Status: $StatusCode",
		"Content-Type: application/json",
		"Content-Length: $($ResponseBody.Length)",
		"Server: cgi.queerlil.tools"
	)
	$ResponseHeaders.ForEach{$_}
	''
	$ResponseBody
}
