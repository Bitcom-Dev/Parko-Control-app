export const getLocationLabelFromCoords = async (lat, long) => {
	const latitude = Number(lat);
	const longitude = Number(long);

	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
		return '';
	}

	const query = new URLSearchParams({
		format: 'jsonv2',
		lat: String(latitude),
		lon: String(longitude),
		zoom: '18',
		addressdetails: '1',
	});

	const endpoint = `https://nominatim.openstreetmap.org/reverse?${query.toString()}`;

	try {
		const response = await fetch(endpoint, {
			headers: {
				Accept: 'application/json',
				'Accept-Language': 'ro,en',
				'User-Agent': 'Parko-Control-Mobile/1.0',
			},
		});

		if (!response.ok) {
			return '';
		}

		const data = await response.json();
		const address = data?.address || {};

		const street =
			address.road ||
			address.pedestrian ||
			address.footway ||
			address.path ||
			address.neighbourhood ||
			address.suburb ||
			'';

		const houseNumber = address.house_number || '';
		const city =
			address.city ||
			address.town ||
			address.village ||
			address.municipality ||
			address.county ||
			'';

		const base = [street, houseNumber ? `nr. ${houseNumber}` : ''].filter(Boolean).join(' ');
		if (base && city) return `${base}, ${city}`;
		if (base) return base;

		if (typeof data?.display_name === 'string' && data.display_name.trim()) {
			return data.display_name.split(',').slice(0, 2).join(',').trim();
		}

		return '';
	} catch {
		return '';
	}
};
