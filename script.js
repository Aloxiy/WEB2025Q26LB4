// Конфигурация API
const API_CONFIG = {
    GEOCODING_API: 'https://geocoding-api.open-meteo.com/v1/search',
    REVERSE_GEOCODING_API: 'https://nominatim.openstreetmap.org/reverse',
    WEATHER_API: 'https://api.open-meteo.com/v1/forecast'
};

// Состояние приложения
const state = {
    currentLocation: null,
    cities: [],
    isLoading: false,
    userDeniedGeolocation: false,
    cityWeatherData: {}
};

// DOM элементы
const elements = {
    currentWeather: document.getElementById('currentWeather'),
    locationForm: document.getElementById('locationForm'),
    cityInput: document.getElementById('cityInput'),
    searchCityBtn: document.getElementById('searchCityBtn'),
    citySuggestions: document.getElementById('citySuggestions'),
    cityError: document.getElementById('cityError'),
    addCityInput: document.getElementById('addCityInput'),
    addCityBtn: document.getElementById('addCityBtn'),
    addCitySuggestions: document.getElementById('addCitySuggestions'),
    addCityError: document.getElementById('addCityError'),
    citiesList: document.getElementById('citiesList'),
    forecastContainer: document.getElementById('forecastContainer'),
    geolocationModal: document.getElementById('geolocationModal'),
    allowGeolocationBtn: document.getElementById('allowGeolocation'),
    denyGeolocationBtn: document.getElementById('denyGeolocation'),
    refreshBtn: document.getElementById('refreshBtn'),
    loadingSpinner: document.getElementById('loadingSpinner')
};

// Список популярных городов для автозаполнения
const POPULAR_CITIES = [
    'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань',
    'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону',
    'Уфа', 'Красноярск', 'Воронеж', 'Пермь', 'Волгоград',
    'Киев', 'Минск', 'Астана', 'Лондон', 'Париж',
    'Берлин', 'Рим', 'Мадрид', 'Нью-Йорк', 'Токио', 'Краснодар'
];

// Инициализация приложения
function init() {
    loadFromLocalStorage();
    setupEventListeners();
    
    if (!state.userDeniedGeolocation && !state.currentLocation) {
        showGeolocationModal();
    } else if (state.currentLocation) {
        updateWeatherForLocation(state.currentLocation);
    }
    
    loadCitiesWeather();
}

// Загрузить погоду для всех городов
async function loadCitiesWeather() {
    if (state.cities.length === 0) {
        renderCitiesList();
        return;
    }
    
    renderCitiesList();
    
    for (const city of state.cities) {
        try {
            await updateWeatherForCity(city);
        } catch (error) {
            console.error(`Ошибка загрузки погоды для ${city.name}:`, error);
        }
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    elements.allowGeolocationBtn.addEventListener('click', getUserGeolocation);
    elements.denyGeolocationBtn.addEventListener('click', denyGeolocation);
    
    elements.searchCityBtn.addEventListener('click', () => searchCity(elements.cityInput.value));
    elements.cityInput.addEventListener('input', () => showSuggestions(elements.cityInput, elements.citySuggestions));
    elements.cityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchCity(elements.cityInput.value);
        }
    });
    
    elements.addCityBtn.addEventListener('click', () => addCity(elements.addCityInput.value));
    elements.addCityInput.addEventListener('input', () => showSuggestions(elements.addCityInput, elements.addCitySuggestions));
    elements.addCityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCity(elements.addCityInput.value);
        }
    });
    
    elements.refreshBtn.addEventListener('click', refreshAllWeather);
}

// Показать модальное окно геолокации
function showGeolocationModal() {
    elements.geolocationModal.style.display = 'flex';
}

// Скрыть модальное окно геолокации
function hideGeolocationModal() {
    elements.geolocationModal.style.display = 'none';
}

// Получить геолокацию пользователя
async function getUserGeolocation() {
    hideGeolocationModal();
    
    if (!navigator.geolocation) {
        showError('Геолокация не поддерживается вашим браузером', elements.cityError);
        showLocationForm();
        return;
    }
    
    showLoading();
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            
            try {
                const locationName = await getLocationName(latitude, longitude);
                
                const location = {
                    name: locationName || 'Текущее местоположение',
                    latitude,
                    longitude,
                    isCurrentLocation: true,
                    displayName: locationName || 'Текущее местоположение'
                };
                
                state.currentLocation = location;
                saveToLocalStorage();
                await updateWeatherForLocation(location);
            } catch (error) {
                const location = {
                    name: 'Текущее местоположение',
                    latitude,
                    longitude,
                    isCurrentLocation: true,
                    displayName: 'Текущее местоположение'
                };
                
                state.currentLocation = location;
                saveToLocalStorage();
                await updateWeatherForLocation(location);
            }
            
            hideLoading();
        },
        (error) => {
            hideLoading();
            state.userDeniedGeolocation = true;
            saveToLocalStorage();
            
            if (error.code === error.PERMISSION_DENIED) {
                showLocationForm();
            } else {
                showError('Не удалось получить ваше местоположение', elements.cityError);
                showLocationForm();
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// Получить название локации по координатам
async function getLocationName(latitude, longitude) {
    try {
        const response = await fetch(
            `${API_CONFIG.REVERSE_GEOCODING_API}?format=json&lat=${latitude}&lon=${longitude}&accept-language=ru`
        );
        
        if (!response.ok) {
            throw new Error('Ошибка получения названия локации');
        }
        
        const data = await response.json();
        
        if (data.address) {
            return data.address.city || 
                   data.address.town || 
                   data.address.village || 
                   data.address.municipality ||
                   (data.address.state ? `${data.address.state}, ${data.address.country}` : data.address.country);
        }
        
        return null;
    } catch (error) {
        console.error('Ошибка получения названия локации:', error);
        return null;
    }
}

// Отказ от геолокации
function denyGeolocation() {
    hideGeolocationModal();
    state.userDeniedGeolocation = true;
    saveToLocalStorage();
    showLocationForm();
}

// Показать форму ввода города
function showLocationForm() {
    elements.locationForm.style.display = 'block';
    elements.currentWeather.style.display = 'none';
}

// Поиск города
async function searchCity(cityName) {
    if (!cityName.trim()) {
        showError('Введите название города', elements.cityError);
        return;
    }
    
    showLoading();
    
    try {
        const cityData = await geocodeCity(cityName);
        
        if (!cityData) {
            showError('Город не найден', elements.cityError);
            hideLoading();
            return;
        }
        
        const location = {
            name: cityData.name,
            latitude: cityData.latitude,
            longitude: cityData.longitude,
            isCurrentLocation: false,
            displayName: `${cityData.name}${cityData.country ? `, ${cityData.country}` : ''}`
        };
        
        state.currentLocation = location;
        saveToLocalStorage();
        await updateWeatherForLocation(location);
        elements.locationForm.style.display = 'none';
        elements.currentWeather.style.display = 'block';
        elements.cityInput.value = '';
        elements.citySuggestions.innerHTML = '';
        hideError(elements.cityError);
    } catch (error) {
        showError('Ошибка при поиске города', elements.cityError);
    }
    
    hideLoading();
}

// Геокодирование города
async function geocodeCity(cityName) {
    try {
        const response = await fetch(`${API_CONFIG.GEOCODING_API}?name=${encodeURIComponent(cityName)}&count=1&language=ru&format=json`);
        
        if (!response.ok) {
            throw new Error('Ошибка геокодирования');
        }
        
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            return {
                name: data.results[0].name,
                latitude: data.results[0].latitude,
                longitude: data.results[0].longitude,
                country: data.results[0].country,
                country_code: data.results[0].country_code
            };
        }
        
        return null;
    } catch (error) {
        console.error('Ошибка геокодирования:', error);
        return null;
    }
}

// Показать подсказки для ввода
function showSuggestions(inputElement, suggestionsElement) {
    const query = inputElement.value.toLowerCase().trim();
    
    if (!query) {
        suggestionsElement.innerHTML = '';
        return;
    }
    
    const filteredCities = POPULAR_CITIES.filter(city => 
        city.toLowerCase().includes(query)
    ).slice(0, 5);
    
    suggestionsElement.innerHTML = filteredCities.map(city => 
        `<div class="suggestion-item" data-city="${city}">${city}</div>`
    ).join('');
    
    suggestionsElement.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            inputElement.value = item.dataset.city;
            suggestionsElement.innerHTML = '';
        });
    });
}

// Добавить город в список
async function addCity(cityName) {
    if (!cityName.trim()) {
        showError('Введите название города', elements.addCityError);
        return;
    }
    
    if (state.cities.some(city => city.name.toLowerCase() === cityName.toLowerCase())) {
        showError('Этот город уже добавлен', elements.addCityError);
        return;
    }
    
    if (state.cities.length >= 5) {
        showError('Можно добавить не более 5 городов', elements.addCityError);
        return;
    }
    
    showLoading();
    
    try {
        const cityData = await geocodeCity(cityName);
        
        if (!cityData) {
            showError('Город не найден', elements.addCityError);
            hideLoading();
            return;
        }
        
        const city = {
            id: Date.now(),
            name: cityData.name,
            latitude: cityData.latitude,
            longitude: cityData.longitude,
            country: cityData.country,
            displayName: `${cityData.name}${cityData.country ? `, ${cityData.country}` : ''}`
        };
        
        state.cities.push(city);
        saveToLocalStorage();
        
        await updateWeatherForCity(city);
        
        renderCitiesList();
        
        elements.addCityInput.value = '';
        elements.addCitySuggestions.innerHTML = '';
        hideError(elements.addCityError);
    } catch (error) {
        showError('Ошибка при добавлении города', elements.addCityError);
    }
    
    hideLoading();
}

// Обновить погоду для локации
async function updateWeatherForLocation(location) {
    if (!location) return;
    
    try {
        const weatherData = await fetchWeatherData(location.latitude, location.longitude);
        renderCurrentWeather(location, weatherData);
        renderForecast(weatherData.daily);
    } catch (error) {
        console.error('Ошибка при получении погоды:', error);
        showError('Не удалось получить данные о погоде', elements.cityError);
    }
}

// Обновить погоду для города
async function updateWeatherForCity(city) {
    try {
        const weatherData = await fetchWeatherData(city.latitude, city.longitude);
        
        state.cityWeatherData[city.id] = {
            current: weatherData.current,
            daily: weatherData.daily
        };
        
        updateCityCard(city);
        
    } catch (error) {
        console.error(`Ошибка при получении погоды для города ${city.name}:`, error);
        showCityError(city.id, 'Не удалось загрузить данные');
    }
}

// Получить данные о погоде
async function fetchWeatherData(latitude, longitude) {
    const response = await fetch(
        `${API_CONFIG.WEATHER_API}?latitude=${latitude}&longitude=${longitude}&` +
        `current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code&` +
        `daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&` +
        `timezone=auto&forecast_days=3`
    );
    
    if (!response.ok) {
        throw new Error('Ошибка при получении данных о погоде');
    }
    
    return await response.json();
}

// Отобразить текущую погоду
function renderCurrentWeather(location, weatherData) {
    const current = weatherData.current;
    const weatherCode = getWeatherDescription(current.weather_code);
    
    elements.currentWeather.innerHTML = `
        <div class="weather-card">
            <div class="weather-header">
                <h2>${location.displayName}</h2>
                <div class="location-info">
                    <i class="fas fa-location-dot"></i>
                    <span>${new Date().toLocaleDateString('ru-RU', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                    })}</span>
                </div>
            </div>
            
            <div class="weather-main">
                <div class="temperature">
                    ${Math.round(current.temperature_2m)}°C
                </div>
                <div class="weather-info">
                    <h3>${weatherCode}</h3>
                    <p>Ощущается как ${Math.round(current.apparent_temperature)}°C</p>
                </div>
            </div>
            
            <div class="weather-details">
                <div class="weather-detail">
                    <i class="fas fa-tint"></i>
                    <p>Влажность</p>
                    <h4>${current.relative_humidity_2m}%</h4>
                </div>
                <div class="weather-detail">
                    <i class="fas fa-wind"></i>
                    <p>Ветер</p>
                    <h4>${current.wind_speed_10m} км/ч</h4>
                </div>
                <div class="weather-detail">
                    <i class="fas fa-cloud-rain"></i>
                    <p>Осадки</p>
                    <h4>${current.precipitation} мм</h4>
                </div>
                <div class="weather-detail">
                    <i class="fas fa-thermometer-half"></i>
                    <p>Погодный код</p>
                    <h4>${current.weather_code}</h4>
                </div>
            </div>
        </div>
    `;
}

// Отобразить прогноз на 3 дня
function renderForecast(dailyData) {
    const days = ['Сегодня', 'Завтра', 'Послезавтра'];
    
    elements.forecastContainer.innerHTML = dailyData.time.slice(0, 3).map((date, index) => {
        const weatherCode = getWeatherDescription(dailyData.weather_code[index]);
        const icon = getWeatherIcon(dailyData.weather_code[index]);
        
        return `
            <div class="forecast-day">
                <h3>${days[index]}</h3>
                <p class="forecast-date">${new Date(date).toLocaleDateString('ru-RU', { 
                    month: 'long', 
                    day: 'numeric' 
                })}</p>
                <div class="forecast-icon">
                    ${icon}
                </div>
                <p class="forecast-description">${weatherCode}</p>
                <div class="forecast-temp">
                    ${Math.round(dailyData.temperature_2m_max[index])}° / ${Math.round(dailyData.temperature_2m_min[index])}°
                </div>
                <div class="forecast-details">
                    <div class="forecast-detail">
                        <i class="fas fa-wind"></i>
                        <p>Ветер: ${dailyData.wind_speed_10m_max[index]} км/ч</p>
                    </div>
                    <div class="forecast-detail">
                        <i class="fas fa-tint"></i>
                        <p>Осадки: ${dailyData.precipitation_sum[index]} мм</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Отобразить список городов
function renderCitiesList() {
    if (state.cities.length === 0) {
        elements.citiesList.innerHTML = '<p class="empty-message">Добавьте города для отображения погоды</p>';
        return;
    }
    
    elements.citiesList.innerHTML = state.cities.map(city => `
        <div class="city-card" data-city-id="${city.id}">
            <div class="city-header">
                <h3>${city.displayName}</h3>
                <button class="remove-city" onclick="removeCity(${city.id})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="city-weather" id="city-weather-${city.id}">
                ${state.cityWeatherData[city.id] ? renderCityWeather(city, state.cityWeatherData[city.id]) : `
                    <div class="loading-spinner small">
                        <div class="spinner"></div>
                        <p>Загрузка погоды...</p>
                    </div>
                `}
            </div>
        </div>
    `).join('');
}

// Отрендерить погоду для города
function renderCityWeather(city, weatherData) {
    const current = weatherData.current;
    const daily = weatherData.daily;
    const weatherCode = getWeatherDescription(current.weather_code);
    
    return `
        <div class="city-weather-content">
            <div class="city-current-weather">
                <div class="temperature-small">
                    ${Math.round(current.temperature_2m)}°C
                </div>
                <div class="city-weather-info">
                    <p>${weatherCode}</p>
                    <div class="city-details">
                        <span><i class="fas fa-tint"></i> ${current.relative_humidity_2m}%</span>
                        <span><i class="fas fa-wind"></i> ${current.wind_speed_10m} км/ч</span>
                        <span><i class="fas fa-cloud-rain"></i> ${current.precipitation} мм</span>
                    </div>
                </div>
            </div>
            
            <div class="city-forecast">
                <h4><i class="fas fa-calendar-alt"></i> Прогноз на 3 дня</h4>
                <div class="city-forecast-days">
                    ${daily.time.slice(0, 3).map((date, index) => `
                        <div class="city-forecast-day">
                            <p class="forecast-day-name">${index === 0 ? 'Сегодня' : index === 1 ? 'Завтра' : 'Послезавтра'}</p>
                            <p class="forecast-day-date">${new Date(date).toLocaleDateString('ru-RU', { 
                                month: 'short', 
                                day: 'numeric' 
                            })}</p>
                            <div class="forecast-day-temp">
                                ${Math.round(daily.temperature_2m_max[index])}°/${Math.round(daily.temperature_2m_min[index])}°
                            </div>
                            <div class="forecast-day-icon">
                                ${getWeatherIcon(daily.weather_code[index])}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// Обновить карточку города
function updateCityCard(city) {
    const cityWeatherElement = document.getElementById(`city-weather-${city.id}`);
    
    if (!cityWeatherElement) return;
    
    if (state.cityWeatherData[city.id]) {
        cityWeatherElement.innerHTML = renderCityWeather(city, state.cityWeatherData[city.id]);
    }
}

// Показать ошибку в карточке города
function showCityError(cityId, message) {
    const cityWeatherElement = document.getElementById(`city-weather-${city.id}`);
    
    if (!cityWeatherElement) return;
    
    cityWeatherElement.innerHTML = `
        <div class="city-weather-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
            <button class="btn-small" onclick="retryLoadCity(${cityId})" style="margin-top: 10px;">
                <i class="fas fa-redo"></i> Повторить
            </button>
        </div>
    `;
}

// Повторить загрузку города
async function retryLoadCity(cityId) {
    const city = state.cities.find(c => c.id === cityId);
    if (city) {
        await updateWeatherForCity(city);
    }
}

// Удалить город из списка
function removeCity(cityId) {
    state.cities = state.cities.filter(city => city.id !== cityId);
    delete state.cityWeatherData[cityId];
    saveToLocalStorage();
    renderCitiesList();
}

// Обновить всю погоду
async function refreshAllWeather() {
    showLoading();
    
    try {
        if (state.currentLocation) {
            await updateWeatherForLocation(state.currentLocation);
        }
        
        const cityPromises = state.cities.map(city => updateWeatherForCity(city));
        await Promise.all(cityPromises);
    } catch (error) {
        console.error('Ошибка при обновлении погоды:', error);
        showError('Не удалось обновить данные о погоде', elements.cityError);
    }
    
    hideLoading();
}

// Вспомогательные функции
function getWeatherDescription(code) {
    const weatherCodes = {
        0: 'Ясно',
        1: 'Преимущественно ясно',
        2: 'Переменная облачность',
        3: 'Пасмурно',
        45: 'Туман',
        48: 'Туман с инеем',
        51: 'Легкая морось',
        53: 'Умеренная морось',
        55: 'Сильная морось',
        56: 'Легкий ледяной дождь',
        57: 'Сильный ледяной дождь',
        61: 'Небольшой дождь',
        63: 'Умеренный дождь',
        65: 'Сильный дождь',
        66: 'Легкий ледяной дождь',
        67: 'Сильный ледяной дождь',
        71: 'Небольшой снег',
        73: 'Умеренный снег',
        75: 'Сильный снег',
        77: 'Снежные зерна',
        80: 'Небольшие ливни',
        81: 'Умеренные ливни',
        82: 'Сильные ливни',
        85: 'Небольшие снегопады',
        86: 'Сильные снегопады',
        95: 'Гроза',
        96: 'Гроза с небольшим градом',
        99: 'Гроза с сильным градом'
    };
    
    return weatherCodes[code] || 'Неизвестно';
}

function getWeatherIcon(code) {
    if (code === 0) return '<i class="fas fa-sun"></i>';
    if (code <= 3) return '<i class="fas fa-cloud-sun"></i>';
    if (code <= 55) return '<i class="fas fa-cloud-rain"></i>';
    if (code <= 67) return '<i class="fas fa-icicles"></i>';
    if (code <= 77) return '<i class="fas fa-snowflake"></i>';
    if (code <= 86) return '<i class="fas fa-cloud-showers-heavy"></i>';
    return '<i class="fas fa-bolt"></i>';
}

function showError(message, errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

function hideError(errorElement) {
    errorElement.style.display = 'none';
}

function showLoading() {
    state.isLoading = true;
    elements.loadingSpinner.style.display = 'block';
}

function hideLoading() {
    state.isLoading = false;
    elements.loadingSpinner.style.display = 'none';
}

// Локальное хранилище
function saveToLocalStorage() {
    localStorage.setItem('weatherAppState', JSON.stringify({
        currentLocation: state.currentLocation,
        cities: state.cities,
        userDeniedGeolocation: state.userDeniedGeolocation,
        cityWeatherData: state.cityWeatherData
    }));
}

function loadFromLocalStorage() {
    const savedState = localStorage.getItem('weatherAppState');
    
    if (savedState) {
        const parsedState = JSON.parse(savedState);
        state.currentLocation = parsedState.currentLocation;
        state.cities = parsedState.cities || [];
        state.userDeniedGeolocation = parsedState.userDeniedGeolocation || false;
        state.cityWeatherData = parsedState.cityWeatherData || {};
        
        renderCitiesList();
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', init);

// Экспорт функций для использования в HTML
window.removeCity = removeCity;
window.retryLoadCity = retryLoadCity;