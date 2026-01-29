#!/usr/bin/pwsh -NoProfile

begin {
	$APIKey = cat /var/www/secrets/porkbun_api_key
	$SecretAPIKey = cat /var/www/secrets/porkbun_secret_api_key
	$RemoveSecret = cat /var/www/secrets/handles_remove_key

	$StatusCode = 200
	$ResponseBody = $null # technically we don't have to set this, but i like keeping track
	$ValidDomains = @('is.vgay.fyi', 'hasa.gripe', 'doeswet.work', 'is.tgirlat.work', 'on.tgirl.quest', 'has.tgirl.quest', 'winning.tgirl.quest', 'failing.tgirl.quest', 'is.tgirl.mom', 'wants.tgirl.mom', 'has.tgirl.mom')
	$ValidRootDomains = @(
		$ValidDomains.Where{$_.Split('.').Length -eq 2} +
		$ValidDomains.Where{$_.Split('.').Length -ge 3}.ForEach{
			$a = $_.Split('.')
			[Array]::Reverse($a)
			$b = $a[0..($a.Length - 2)]
			[Array]::Reverse($b)
			$b -join '.'
		}
	) | Get-Unique

	$Query = [Web.HTTPUtility]::ParseQueryString($env:QUERY_STRING)
	$Domain = $Query['domain']
	$RootDomain = $ValidRootDomains.Where{$Domain.EndsWith($_)}
	$DID = $Query['did']
	if ([string]::IsNullOrWhitespace($Domain)) {
		$StatusCode = 400
		$ResponseBody = "Error: ?domain query parameter must be set."
		return
	}
	if ([string]::IsNullOrWhitespace($DID)) {
		$StatusCode = 400
		$ResponseBody = "Error: ?did query parameter must be set."
		return
	}
	if (-NOT $DID.StartsWith('did:plc:')) {
		$StatusCode = 400
		$ResponseBody = "?did must start with 'did:plc:'"
		return
	}
	if ($DID.Length -ne 32) {
		$StatusCode = 400
		$ResponseBody = "?did must be exactly 32 characters in length (did:plc: and a 24 character unique identifier)."
		return
	}

	if (-NOT $Domain.Contains('.')) {
		$StatusCode = 400
		$ResponseBody = "Error: The provided domain is invalid."
		return
	}
	$DomainSuffix = $ValidDomains.Where{$Domain.EndsWith($_)}
	if ([string]::IsNullOrWhitespace($DomainSuffix)) {
		$StatusCode = 400
		$ResponseBody = "Error: The provided domain does not end with a valid suffix: $($ValidDomains -join ', ')"
		return
	}
	$DomainPrefix = $Domain.Replace(".$DomainSuffix", [string]::Empty)
	if ([string]::IsNullOrWhitespace($DomainPrefix) -or $DomainPrefix.Contains('.')) {
		$StatusCode = 400
		$ResponseBody = "Error: The provided domain is either at the apex of the target domain, or itself contains a subdomain ($DomainPrefix). [$DomainSuffix]"
		return
	}

	$RemoveKey = $Query['remove']
	$ShouldRemove = $RemoveKey -eq $RemoveSecret
	if (-NOT [string]::IsNullOrWhitespace($RemoveKey) -and -NOT $ShouldRemove) {
		$StatusCode = 403
		$ResponseBody = "Error: Remove secret invalid."
		return
	}
}

process {
	if ($StatusCode -ne 200) { return }
	$HandleResolves = [bool](Invoke-RestMethod "https://at.queerlil.tools/xrpc/com.atproto.identity.resolveHandle?handle=$Domain" -SkipHttpErrorCheck).did
	if ($HandleResolves -and -NOT $ShouldRemove) {
		$StatusCode = 500
		$ResponseBody = "Handle already resolves."
		return
	}

	if ($DomainSuffix -eq $RootDomain) {
		$RecordName = "_atproto.$DomainPrefix"
	} else {
		$RecordName = "_atproto.$DomainPrefix.$($DomainSuffix.Replace(".$RootDomain", ''))"
	}

	if ($ShouldRemove) {
		$RemoveRequest = @{
			Uri = "https://api.porkbun.com/api/json/v3/dns/deleteByNameType/$RootDomain/TXT/$RecordName"
			Method = 'POST'
			Body = ConvertTo-Json @{
				apikey = $APIKey
				secretapikey = $SecretAPIKey
			}
		}
		try { $RemoveResponse = Invoke-RestMethod @RemoveRequest }
		catch { $RemoveResponse = [string]::Empty }
		if ([string]::IsNullOrWhitespace($RemoveResponse)) {
			$StatusCode = 201
			$ResponseBody = "The _atproto.$Domain TXT record has been deleted."
			return
		}

		$ResponseBody = $RemoveResponse | ConvertTo-Json -Compress
		return
	}

	$APIRequest = @{
		Uri = "https://api.porkbun.com/api/json/v3/dns/create/$RootDomain"
		Method = 'POST'
		Body = ConvertTo-Json @{
			apikey = $APIKey
			secretapikey = $SecretAPIKey
			name = $RecordName
			type = 'TXT'
			content = "did=$DID"
			ttl = 5
		}
	}
	try { $APIResponse = Invoke-RestMethod @APIRequest }
	catch { $APIResponse = [string]::Empty }
	if ([string]::IsNullOrWhitespace($APIResponse)) {
		$StatusCode = 201
		$ResponseBody = "The _atproto.$Domain TXT record has been created. Please wait for Bluesky to resolve it."
		return
	}
	$ResponseBody = $APIResponse | ConvertTo-Json -Compress
}


end {
	$ResponseHeaders = @(
		"Status: $StatusCode"
		"Content-Type: text/plain",
		"Content-Length: $($ResponseBody.Length)",
		"Server: cgi.queerlil.tools"
	)
	$ResponseHeaders.ForEach{$_}
	''
	$ResponseBody
}
