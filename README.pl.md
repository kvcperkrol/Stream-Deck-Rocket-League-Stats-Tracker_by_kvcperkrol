# Rocket League HUD dla Stream Deck

🇬🇧 [English](README.md) · 🇵🇱 **Polski**

Wtyczka do 15-klawiszowego Stream Decka (5×3) i do Stream Decka +. Po uruchomieniu Rocket League pokazuje na klawiszach wynik, czas,
rangę, ostatniego strzelca z prędkością piłki, demolki, obrony oraz Twój boost, prędkość auta, posiadanie piłki i punkty.

**Instalacja → uruchom grę → działa.** Wtyczka sama włącza w grze oficjalne [Stats API](https://www.rocketleague.com/developer/stats-api),
sama przełącza Stream Decka na swój profil, gdy gra startuje, i wraca do poprzedniego, gdy gra się zamknie.

Wtyczka tylko czyta dane: nie steruje ani myszą, ani klawiaturą i niczego do gry nie wysyła.

> Projekt nieoficjalny — nie jest powiązany z Psyonix, Epic Games ani Elgato. „Rocket League” jest znakiem towarowym Psyonix.

## Podgląd na różnych deckach

Każdy klawisz narysowany tak, jak wygląda w trwającym meczu, z nazwą jego funkcji pod spodem — jeden obraz na każdy obsługiwany deck.

<p align="center"><img src="docs/screenshots/layout-5x3.png" alt="Stream Deck 5×3 z podpisanymi klawiszami" width="600"></p>

<p align="center"><img src="docs/screenshots/layout-plus.png" alt="Stream Deck +: 8 klawiszy i pasek dotykowy, każdy element podpisany" width="720"></p>

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/layout-neo.png" alt="Stream Deck Neo" width="330"><br><sub>Stream Deck Neo</sub></td>
    <td align="center"><img src="docs/screenshots/layout-mini.png" alt="Stream Deck Mini" width="260"><br><sub>Stream Deck Mini</sub></td>
  </tr>
  <tr>
    <td align="center" colspan="2"><img src="docs/screenshots/layout-xl.png" alt="Stream Deck XL" width="720"><br><sub>Stream Deck XL</sub></td>
  </tr>
</table>

<sub>Rendery generowane przez `npm run preview:layout`. Liczby (MMR, ranga, wynik, punkty, prędkości) pochodzą z prawdziwych meczów; nicki graczy to zamienniki.</sub>

## Instalacja

1. Pobierz `Rocket-League-HUD.streamDeckPlugin` z [najnowszego wydania](../../releases/latest) (bezpośredni link: [`Rocket-League-HUD.streamDeckPlugin`](../../releases/latest/download/Rocket-League-HUD.streamDeckPlugin)), dwukliknij go i potwierdź instalację w aplikacji Stream Deck. (Własna budowa: `npm run pack`, patrz Rozwój.)
2. Uruchom Rocket League. Przy pierwszym uruchomieniu **po instalacji wtyczki zrestartuj grę raz**, jeśli była już włączona
   (gra czyta konfigurację tylko przy starcie; klawisz pokaże wtedy „RESTART GRY”).
3. Wejdź w dowolny klawisz wtyczki w aplikacji Stream Deck → panel po prawej: wpisz **swoje rangi** (patrz niżej).

Wymagania: Stream Deck 6.6+ (sprawdzone z 7.0.3), Windows 10/11, Rocket League z Epic Games lub Steam.

## Język

Domyślnie klawisze i panel są **po angielsku**. Polski włączysz w panelu wtyczki (dowolny klawisz → **General / Ogólne →
Language / Język**). Zmiana działa od razu na wszystkich klawiszach.

## Układ klawiszy

```
 RANGA        TRYB           WYNIK (Ty)    CZAS         WYNIK (rywal)
 MMR + W/P    OSTATNI GOL    ┌──────────  BANER ZDARZEŃ  ──────────┐
 BOOST        AUTO           POSIADANIE    PUNKTY       PIŁKA (km/h)
```

| Klawisz | Co pokazuje |
|---|---|
| **Ranga** | Emblemat i nazwa rangi dla trybu rankingowego, w którym grasz (Duel / Doubles / Standard …). W trybach **bez rankingu** (towarzyski, trening, mecz prywatny) pokazuje **NIERANKINGOWY** i nazwę trybu — nie pożycza rangi z podobnego trybu rankingowego. |
| **MMR + W/P** | Twój MMR dla tego trybu i bilans wygranych/porażek od uruchomienia gry. W meczu towarzyskim jest to ukryty MMR towarzyski z logu gry, opisany „MMR TOWARZ.”. |
| **Tryb** | Playlista i **RANKINGOWY** / **NIERANKINGOWY**, liczba graczy w drużynie. |
| **Wynik (lewy / prawy)** | Gole drużyn w **kolorach, w jakich pokazuje je gra** (np. czarny lub szary przeciwnik). Po lewej jest **Twoja drużyna** (jak w HUD-zie gry), po prawej przeciwnik; Twoja ma znacznik „TY”. Miga po golu. W ustawieniach można wymusić „niebiescy zawsze po lewej”. Nazwa drużyny to nazwa własna (np. klubu) albo „NIEBIESCY / POMARAŃCZOWI” w języku wtyczki. |
| **Czas** | Czas do końca, dogrywka (`+0:12`), pauza. Ostatnie 30 s na czerwono. |
| **Ostatni gol** | Kto strzelił i z jaką prędkością piłki — zostaje też po wyjściu z meczu. |
| **Baner** (3 klawisze) | **Gol** (prędkość · GOL! + strzelec · asysta), **demolka** (kto → kogo), obrona, epicka obrona, poprzeczka, dogrywka, powtórka, odliczanie, zwycięstwo/porażka. Bez zdarzeń: Twoje gole / asysty / obrony w meczu. |
| **Piłka** | Aktualna prędkość piłki, pasek i maksimum meczu. |
| **Boost** | Twój boost 0–100 jako pierścień; robi się czerwony i miga, gdy się kończy. |
| **Auto** | Prędkość Twojego auta i pasek do bariery dźwięku; po jej przekroczeniu miga **SUPERSONIC**. |
| **Posiadanie** | Która drużyna ostatnio dotykała piłki (znacznik) i jaki procent meczu piłka „była” u każdej z nich — w tych samych kolorach i kolejności co wynik. |
| **Punkty** | Twoje punkty w meczu oraz strzały i demolki. |

Klawisze możesz dowolnie przestawiać (kategoria „Rocket League HUD”). Trzy klawisze *Baner* w jednym rzędzie łączą się
w jeden szeroki baner (od lewej do prawej); kolejność można wymusić w panelu klawisza.

## Obsługiwane decki

Instalacja wtyczki tworzy osobny profil **„Rocket League HUD”** na każdym podłączonym decku obsługiwanego modelu (Stream Deck 6.6+
robi to przy instalacji i nie przełącza się na niego). Po uruchomieniu gry deck przełącza się na swój profil, a po zamknięciu gry
wraca do poprzedniego.

| Deck | Klawisze | Co dostajesz |
|---|---|---|
| Stream Deck / MK.2, aplikacja mobilna | 5×3 | pełny układ poniżej |
| Stream Deck Mini | 3×2 | wynik, czas i baner zdarzeń (w spoczynku: Twoje gole / asysty / obrony) |
| Stream Deck XL | 8×4 | pełny układ; dwa dolne rzędy zostają wolne na Twoje klawisze |
| Stream Deck Neo | 4×2 | ranga, wynik, czas, baner zdarzeń i boost |
| Stream Deck + | 4×2 klawisze, 4 pokrętła | 8 klawiszy i pasek dotykowy — patrz [Stream Deck +](#stream-deck--pasek-dotykowy) |
Inne decki (Pedal, Studio, + XL …) nie mają jeszcze dołączonego profilu — wtyczka ich nie przełącza, ale wszystkie akcje można
przeciągnąć na ich klawisze ręcznie. Profil 5×3 jest tym używanym na prawdziwym sprzęcie; profile Mini, XL, Neo i + sprawdziłem tylko
na symulowanych urządzeniach (struktura, przełączanie profilu, układ klawiszy).

## Stream Deck + (pasek dotykowy)

Wtyczka obsługuje też **Stream Deck +** (8 klawiszy, 4 pokrętła i pasek dotykowy). Animowany baner, który na decku 5×3 zajmuje
trzy klawisze, może działać na całym pasku dotykowym.


<p align="center"><img src="docs/screenshots/strip-idle.png" alt="Pasek dotykowy między zdarzeniami: ranga, MMR, ostatni gol i moje statystyki" width="720"><br><sub>Między zdarzeniami: ranga, MMR, ostatni gol, Twoje gole / asysty / obrony</sub></p>
<p align="center"><img src="docs/screenshots/strip-goal.png" alt="Gol na całym pasku dotykowym" width="720"><br><sub>Gol: prędkość piłki po lewej, GOL! i strzelec pośrodku, asysta po prawej</sub></p>

* Po uruchomieniu gry deck przełącza się na dołączony profil: Twój wynik, czas, wynik rywala, boost, prędkość auta, posiadanie,
  punkty i prędkość piłki na 8 klawiszach oraz akcja **Pasek dotykowy** na każdym z czterech pokręteł.
* **Między zdarzeniami** ćwiartka paska nad każdym pokrętłem pokazuje jeden panel — ikonę i nazwę rangi, MMR ze zmianą i bilansem
  wygranych/porażek, ostatni gol oraz Twoje gole / asysty / obrony. **Gdy coś się dzieje** (gol, demolka, obrona, dogrywka,
  powtórka, zwycięstwo …) cztery ćwiartki razem pokazują ten sam animowany baner co trzy klawisze banera, na całej szerokości.
* Pasek jest opcjonalny: zdejmij akcje z pokręteł, a klawisze działają jak dotąd. Żeby ułożyć to samemu, przeciągnij
  **Pasek dotykowy (Stream Deck +)** na pokrętła w aplikacji Stream Deck. Każde pokrętło pokazuje ćwiartkę nad sobą; w panelu
  akcji możesz przypiąć inną.
* **Nie testowane na prawdziwym urządzeniu:** nie było pod ręką Stream Decka +. Sprawdziłem to na symulowanym urządzeniu (obrazy
  paska, przełączenie profilu i komunikaty protokołu), a dołączony profil ma taką samą budowę jak własny profil Elgato dla
  Stream Decka + (ten z wtyczki Volume Controller), ale nie był próbowany na prawdziwym urządzeniu. Jeśli się nie pojawi, dodaj
  akcje ręcznie i zgłoś to jako issue.

## MMR — sam z logu gry; ranga — wpisujesz

**MMR uzupełnia się sam.** Rocket League zapisuje w lokalnym pliku `Documents\My Games\Rocket League\TAGame\Logs\Launch.log`
Twoją umiejętność przy każdym starcie kolejki (`PartyLeaderMMR`). Wtyczka czyta ten plik (bez logowania, bez API, bez ingerencji
w grę) i przelicza `MMR = mu × 20 + 100`. Przelicznik sprawdzony na profilu z rocketleague.tracker.network: 47,4225 → 1048
(tracker: Casual 1 048); 28,5405 → 671, a tracker pokazywał 655 po przegranym meczu (−16).

* Wartość jest zapisana **przed meczem**, więc nowy wynik pojawia się przy następnym starcie kolejki na tę samą playlistę.
  Klucz pokazuje też zmianę od poprzedniej kolejki (np. `+9`, `−16`).
* Liczą się tylko kolejki **na jedną playlistę** i **bez grupy** (przy kilku playlistach gra loguje średnią, a w grupie „lider”
  może być kimś innym). W menu klucz pokazuje MMR playlisty z ostatniej kolejki, w meczu — playlisty granego meczu.
* `PartyLeaderTier` z logu to **nie** ranga danej playlisty (jest stały — to Twój najwyższy tier ze wszystkich
  playlist), więc **rangę i dywizję wpisujesz ręcznie** w panelu (sekcja „Twoje rangi”). Wpisany tam MMR jest tylko zapasem
  i dotyczy wyłącznie trybów rankingowych.
* Gdy brakuje pliku ikony, wtyczka rysuje własny emblemat.

## Ikony rang

Klawisz Ranga używa ikon rang z gry (Bronze I … Supersonic Legend oraz jedna dla gry bez rankingu). Są © Psyonix / Epic Games,
pobrane z [Rocket League Wiki](https://rocketleague.fandom.com), zmniejszone do 96×96 px i użyte wyłącznie do pokazania Twojej
własnej rangi w tej darmowej, nieoficjalnej wtyczce. **Nie** obejmuje ich licencja tego repozytorium — patrz
[`imgs/ranks/NOTICE.txt`](mov.remake.rlhud.sdPlugin/imgs/ranks/NOTICE.txt). Jeśli właściciel praw sobie tego nie życzy, zostaną usunięte,
a wtyczka wróci do własnych emblematów.

Żeby użyć innych ikon, wrzuć pliki PNG do `%APPDATA%\RLHUD\rank-icons\` — mają pierwszeństwo przed dołączonymi (folder
powstaje przy pierwszym uruchomieniu; panel wtyczki pokazuje jego ścieżkę i liczbę znalezionych własnych ikon).

* Nazwy plików: `bronze-1.png` … `diamond-2.png` … `grand-champion-3.png`, `supersonic-legend.png`, `unranked.png` — albo numer tieru, `0.png` … `22.png`.
* Najlepiej PNG do 200 KB, w przybliżeniu kwadratowy, z przezroczystym tłem.
* Nowe pliki są wykrywane w kilka sekund, bez restartu.

## Skąd wiadomo, który gracz to Ty

Gra zapisuje w `Launch.log`, na które konto jest zalogowana (`HandleLocalPlayerLoginStatusChanged PlayerName=… PlayerID=Epic|…|0`).
`PlayerID` jest dokładnie tym, co Stats API wysyła jako `PrimaryId`, więc Twoje punkty, boost, prędkość, drużyna i znacznik „TY”
pochodzą zawsze od właściwego gracza — na każdym komputerze od razu, bez konfiguracji. Kamera jest tylko ostatecznością, gdy
logu nie ma. Panel wtyczki pokazuje „Ty w grze: <nick>” i ostrzega, gdy ręcznie wpisany nick różni się od konta z gry.

Wtyczka czyta z logu **tylko** tę jedną linię i linie MMR. W tym samym pliku są też linie z jednorazowym kodem logowania Epic —
ich wtyczka nie czyta, nie zapisuje ani nie loguje.

## Zapis danych meczu do diagnostyki

**Domyślnie wyłączone.** Po włączeniu w panelu wtyczki („Zapisuj dane meczu do diagnostyki”) wtyczka zapisuje lokalnie mały, **zanonimizowany** log Stats API (`%APPDATA%\RLHUD\captures\stats-api.ndjson`, max ok. 2×3 MB):
inni gracze są zastąpieni przez P2, P3…, zostaje tylko Twój nick i ID. Nic nie jest nigdzie wysyłane. Służy do analizy błędów
widocznych w prawdziwym meczu, np. do dołączenia do zgłoszenia błędu; wtyczka do działania tego nie potrzebuje.

## Diagnostyka

Panel wtyczki u góry pokazuje: czy gra działa, czy Stats API jest połączone, stan konfiguracji gry i ID ostatniej playlisty.

| Objaw | Przyczyna / rozwiązanie |
|---|---|
| „RESTART GRY” na banerze | Gra wystartowała, zanim wtyczka włączyła Stats API. Zrestartuj Rocket League. |
| Baner: „Uruchom grę” mimo działającej gry | Zainstalowana wersja gry nie została znaleziona — wpisz folder w Zaawansowane → „Folder gry”. |
| Zły tryb / „Playlist #NN” | Nieznane ID playlisty — nagraj mecz (`npm run record`) i dopisz ID w `src/core/playlists.ts`. |

Log wtyczki: `%APPDATA%\Elgato\StreamDeck\Plugins\mov.remake.rlhud.sdPlugin\logs`.

## Co dokładnie robi z plikami gry

Przy starcie wtyczka (i po zamknięciu gry) ustawia w `…\TAGame\Config\DefaultStatsAPI.ini` (oraz `TAStatsAPI.ini`, jeśli istnieje)
`PacketSendRate=10`, o ile było `0`. Istniejące, niezerowe wartości użytkownika nie są nadpisywane, komentarze i końce linii
zostają, a przed pierwszą zmianą powstaje kopia `*.rlhud.bak`. Wynik testów tej logiki: `test/core.test.ts`.

## Prawdziwe Stats API a jego dokumentacja

Wtyczka była poprawiana na nagraniach prawdziwej gry (`npm run record`). Różnice względem oficjalnej dokumentacji:

* `Data` w każdej wiadomości to **tekst z JSON-em**, a nie obiekt.
* Prędkości (piłka, samochód, `GoalSpeed`) są **od razu w km/h** — dokumentacja pisze „uu/s”.
* Polskie nazwy drużyn przychodzą w kodowaniu Windows-1250 — wtyczka naprawia kodowanie każdego napisu osobno.
* Pola „tylko dla obserwatora” (`Speed`, `Boost` …) są wysyłane także graczowi — także w meczach online.
* `Teams[].ColorPrimary` to prawdziwy kolor drużyny (domyślnie `1873FF` / `C26418`; klub może go zmienić, np. na czarny `262626`).
* Wynik w `UpdateState` jest wiarygodny w trakcie powtórek; wtyczka mimo to ignoruje wszystko, co przychodzi w powtórce.
* **Nie sprawdzone jeszcze w meczu z innymi graczami:** nazwy zdarzeń `StatfeedEvent` (demolka, obrona), ID playlist Hoops/Rumble/Dropshot.

## Licencja

[MIT](LICENSE) **z klauzulą Commons Clause** (dotyczy kodu i własnej grafiki wtyczki, nie ikon rang z gry — patrz wyżej): możesz swobodnie używać, kopiować, modyfikować i udostępniać wtyczkę, ale nie wolno jej
**sprzedawać** ani sprzedawać produktu lub usługi, której wartość w istotnej części pochodzi z wtyczki (także płatnego hostingu,
wsparcia czy konsultacji wokół niej). Przez ten warunek projekt jest „source-available”, a nie „open source” w rozumieniu OSI.
Streamowanie z jej użyciem na monetyzowanym kanale jest w porządku — nie sprzedajesz wtyczki.

## Rozwój

```bash
npm install
npm run build        # manifest + grafiki + profil + paczka (esbuild)
npm test             # testy jednostkowe + testy na prawdziwym nagraniu meczu (test/fixtures)
npm run e2e          # wtyczka ⇄ udawany Stream Deck ⇄ udawana gra (hermetyczny — nie dotyka prawdziwej gry)
npm run preview      # rysuje pokład dla scenariuszy meczu → preview/*.png
npm run mock         # udawana gra (ws://127.0.0.1:49124) — pokaz bez Rocket League
npm run record       # nagrywa prawdziwe Stats API do captures/*.ndjson + podsumowanie
npm run pack         # typecheck + testy + build + walidacja + dist/*.streamDeckPlugin
```

Struktura: `src/core` (stan meczu, bez zależności od Stream Decka; teksty w `src/core/i18n.ts`), `src/ui` (rysowanie SVG),
`src/net` + `src/sys` (WebSocket, konfiguracja gry), `src/hub.ts` (spina wszystko), `tools/` (generatory i testy).
Nowy język to jeden słownik w `src/core/i18n.ts` i jeden w `mov.remake.rlhud.sdPlugin/ui/pi.html`.
