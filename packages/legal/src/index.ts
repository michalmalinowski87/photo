export type LegalDocId = 'privacy' | 'terms';

export type LegalDocMeta = {
  id: LegalDocId;
  title: string;
  version: string;
  updatedAt: string; // YYYY-MM
};

/** Company and legal document config used to fill placeholders in legal HTML. */
export type CompanyConfig = {
  company_name: string;
  company_tax_id: string;
  company_address: string;
  company_email: string;
  legal_document_publication_date: string;
};

const PLACEHOLDERS: (keyof CompanyConfig)[] = [
  'company_name',
  'company_tax_id',
  'company_address',
  'company_email',
  'legal_document_publication_date',
];

/**
 * Replaces {{key}} placeholders in HTML with values from config.
 * Use after getLegalHtml(id) to render documents with company data.
 */
export function fillLegalPlaceholders(html: string, config: CompanyConfig): string {
  let out = html;
  for (const key of PLACEHOLDERS) {
    const value = config[key] ?? '';
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return out;
}

export const LEGAL_DOC_VERSIONS = {
  privacy: '2026-02',
  terms: '2026-02',
} as const;

export function getLegalDocMeta(id: LegalDocId): LegalDocMeta {
  if (id === 'privacy') {
    return { id, title: 'Polityka Prywatności PhotoCloud', version: LEGAL_DOC_VERSIONS.privacy, updatedAt: '2026-02' };
  }
  return { id, title: 'Regulamin Usługi PhotoCloud', version: LEGAL_DOC_VERSIONS.terms, updatedAt: '2026-02' };
}

/**
 * Canonical HTML content of legal documents.
 * This is the single source of truth used by LANDING (HTML render) and backend (PDF generation).
 *
 * NOTE: This HTML is static and trusted (not user-generated).
 */
export function getLegalHtml(id: LegalDocId): string {
  switch (id) {
    case 'privacy':
      return PRIVACY_HTML;
    case 'terms':
      return TERMS_HTML;
  }
}

/**
 * Decode numeric HTML entities (decimal and hex) so Polish and other Unicode chars render correctly in PDF.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/**
 * Strips HTML to plain text (for backend PDF generation).
 * Use getLegalPlainTextFromHtml(fillLegalPlaceholders(getLegalHtml(id), config)) when you have company config.
 */
export function getLegalPlainTextFromHtml(html: string): string {
  const stripped = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h1|h2|h3|li|tr|table|thead|tbody|tfoot|ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[ \\t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return decodeHtmlEntities(stripped);
}

/**
 * Plain text of a legal document (may contain {{placeholders}} if not filled).
 * For PDF with company data use: getLegalPlainTextFromHtml(fillLegalPlaceholders(getLegalHtml(id), config)).
 */
export function getLegalPlainText(id: LegalDocId): string {
  return getLegalPlainTextFromHtml(getLegalHtml(id));
}

const PRIVACY_HTML = `
  <h1>Polityka Prywatności PhotoCloud</h1>
  <div class="legal-meta">
    <span><strong>Stan:</strong> {{legal_document_publication_date}}</span>
    <span><strong>Wersja:</strong> ${LEGAL_DOC_VERSIONS.privacy}</span>
  </div>

  <h2>1. Kto jest administratorem Twoich danych osobowych?</h2>
  <p>Administratorem Twoich danych osobowych jest:</p>
  <p><strong>{{company_name}}</strong><br/>
  NIP: <strong>{{company_tax_id}}</strong><br/>
  Adres siedziby: <strong>{{company_address}}</strong><br/>
  E-mail kontaktowy: <strong>{{company_email}}</strong><br/>
  (dalej: „Administrator”, „my” lub „PhotoCloud”)</p>

  <h2>2. Jak możesz się z nami skontaktować w sprawach ochrony danych?</h2>
  <p>Wszelkie pytania dotyczące przetwarzania Twoich danych osobowych możesz kierować na adres e-mail: <strong>{{company_email}}</strong> lub listownie na adres siedziby.</p>
  <p>Nie wyznaczyliśmy Inspektora Ochrony Danych (IOD), ponieważ nie jest to wymagane w naszej skali działalności.</p>

  <h2>3. Jakie dane osobowe przetwarzamy i w jakim celu?</h2>
  <table class="legal-table">
    <thead>
      <tr>
        <th>Cel przetwarzania</th>
        <th>Kategorie danych osobowych</th>
        <th>Podstawa prawna (RODO)</th>
        <th>Okres przechowywania</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Założenie i prowadzenie Konta fotografa</td>
        <td>Imię, nazwisko / nazwa firmy, e-mail, numer telefonu, dane logowania</td>
        <td>Art. 6 ust. 1 lit. b) – wykonanie umowy</td>
        <td>Do czasu usunięcia Konta + 6 lat (roszczenia)</td>
      </tr>
      <tr>
        <td>Tworzenie, zarządzanie i udostępnianie Galerii zdjęć</td>
        <td>Dane Galerii (nazwa, hasło, metadane zdjęć), dane Klienta (jeśli podane)</td>
        <td>Art. 6 ust. 1 lit. b) – wykonanie umowy</td>
        <td>Do czasu usunięcia Galerii + 6 lat</td>
      </tr>
      <tr>
        <td>Doładowanie i prowadzenie salda Portfela</td>
        <td>Kwota doładowania, historia transakcji, dane płatnicze (przetwarzane przez Stripe/Przelewy24)</td>
        <td>Art. 6 ust. 1 lit. b) + lit. c) (obowiązek podatkowy)</td>
        <td>Do czasu usunięcia Konta + 5 lat (prawo podatkowe)</td>
      </tr>
      <tr>
        <td>Realizacja płatności za Galerie i Portfel</td>
        <td>Dane transakcyjne, dane płatnicze (przetwarzane przez operatora płatności)</td>
        <td>Art. 6 ust. 1 lit. b) + lit. c)</td>
        <td>5 lat od końca roku podatkowego</td>
      </tr>
      <tr>
        <td>Wysyłanie powiadomień systemowych i e-maili transakcyjnych</td>
        <td>Adres e-mail, imię/nazwa użytkownika</td>
        <td>Art. 6 ust. 1 lit. b) + lit. f)</td>
        <td>Do czasu usunięcia Konta lub wycofania zgody</td>
      </tr>
      <tr>
        <td>Obsługa reklamacji, roszczeń i zapytań</td>
        <td>Dane kontaktowe, treść reklamacji/zapytania</td>
        <td>Art. 6 ust. 1 lit. c) + lit. f)</td>
        <td>Do czasu przedawnienia roszczeń (6 lat)</td>
      </tr>
      <tr>
        <td>Marketing bezpośredni własnych usług (opcjonalnie)</td>
        <td>Adres e-mail, imię/nazwa użytkownika</td>
        <td>Art. 6 ust. 1 lit. f) (prawnie uzasadniony interes) lub lit. a) (zgoda)</td>
        <td>Do czasu skutecznego sprzeciwu lub wycofania zgody</td>
      </tr>
      <tr>
        <td>Zapewnienie bezpieczeństwa i zapobieganie nadużyciom</td>
        <td>Logi dostępu, adres IP, dane techniczne</td>
        <td>Art. 6 ust. 1 lit. f) (prawnie uzasadniony interes)</td>
        <td>Do 12 miesięcy lub do czasu wyjaśnienia incydentu</td>
      </tr>
    </tbody>
  </table>

  <h2>4. Czy musisz podawać dane?</h2>
  <p>Podanie danych jest dobrowolne, ale niezbędne do:</p>
  <ul>
    <li>założenia Konta i korzystania z Usługi (art. 6 ust. 1 lit. b RODO),</li>
    <li>doładowania Portfela i opłacania Galerii.</li>
  </ul>
  <p>Odmowa podania danych uniemożliwi rejestrację, utworzenie Galerii lub doładowanie Portfela.</p>

  <h2>5. Komu przekazujemy Twoje dane?</h2>
  <p>Twoje dane mogą być przekazywane następującym podmiotom:</p>
  <ul>
    <li><strong>Podmioty przetwarzające w naszym imieniu (procesorzy):</strong> AWS (hosting, przechowywanie plików i danych), Stripe / Przelewy24 / inny operator płatności (przetwarzanie płatności), Amazon SES (wysyłka e-maili transakcyjnych), dostawcy narzędzi analitycznych (np. CloudWatch, jeśli używany).</li>
    <li><strong>Podmioty niezależne (współadministratorzy lub odrębni administratorzy):</strong> organy publiczne (np. Urząd Skarbowy, UODO, policja, sądy) – gdy wymagają tego przepisy prawa.</li>
  </ul>

  <h2>6. Czy przekazujemy dane poza Europejski Obszar Gospodarczy?</h2>
  <p>Tak – część usług (AWS, Stripe) korzysta z serwerów w Stanach Zjednoczonych.</p>
  <p>Przekazywanie odbywa się na podstawie:</p>
  <ul>
    <li>Decyzji wykonawczej Komisji Europejskiej z 10 lipca 2023 r. (EU-US Data Privacy Framework) lub</li>
    <li>Standardowych Klauzul Umownych (SCC) + dodatkowej oceny ryzyka transferu (TIA).</li>
  </ul>

  <h2>7. Jakie prawa Ci przysługują?</h2>
  <p>Zgodnie z RODO masz prawo do:</p>
  <ul>
    <li>dostępu do swoich danych i otrzymania ich kopii,</li>
    <li>sprostowania (poprawienia) danych,</li>
    <li>usunięcia danych („prawo do bycia zapomnianym”) – w zakresie, w jakim nie mamy obowiązku ich przechowywać (np. dane podatkowe),</li>
    <li>ograniczenia przetwarzania,</li>
    <li>wniesienia sprzeciwu wobec przetwarzania (szczególnie w przypadku marketingu),</li>
    <li>przenoszenia danych (jeśli przetwarzamy je na podstawie umowy lub zgody i w sposób zautomatyzowany),</li>
    <li>cofnięcia zgody w dowolnym momencie (jeśli przetwarzanie opiera się na zgodzie),</li>
    <li>wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (uodo.gov.pl).</li>
  </ul>

  <h2>8. Czy podejmujemy zautomatyzowane decyzje lub profilowanie?</h2>
  <p>Nie dokonujemy zautomatyzowanego podejmowania decyzji, o którym mowa w art. 22 RODO, ani profilowania w rozumieniu RODO.</p>

  <h2>9. Jak długo przechowujemy Twoje dane?</h2>
  <p>Okresy przechowywania podaliśmy w tabeli w pkt 3. Po upływie tych okresów dane są anonimizowane lub usuwane, chyba że mamy obowiązek prawny ich przechowywania (np. dane księgowe – 5 lat).</p>

  <h2>10. Bezpieczeństwo danych</h2>
  <p>Stosujemy odpowiednie środki techniczne i organizacyjne (szyfrowanie transmisji HTTPS, szyfrowanie danych w spoczynku w AWS, kontrola dostępu, regularne aktualizacje), aby chronić Twoje dane przed utratą, zniszczeniem, nieuprawnionym dostępem lub ujawnieniem.</p>

  <h2>11. Zmiany Polityki Prywatności</h2>
  <p>Zastrzegamy sobie prawo do zmiany niniejszej Polityki. O istotnych zmianach poinformujemy Cię z wyprzedzeniem (np. e-mailem lub komunikatem w serwisie). Aktualna wersja jest zawsze dostępna pod tym samym adresem.</p>

  <h2>12. Kontakt w sprawach RODO</h2>
  <p>Wszelkie pytania, wnioski i oświadczenia dotyczące przetwarzania danych osobowych kieruj na adres: <strong>{{company_email}}</strong> lub listownie na adres siedziby.</p>
  <p class="legal-note"><strong>Data ostatniej aktualizacji:</strong> {{legal_document_publication_date}}</p>
`;

const TERMS_HTML = `
  <h1>Regulamin Usługi PhotoCloud</h1>
  <div class="legal-meta">
    <span><strong>Stan:</strong> {{legal_document_publication_date}}</span>
    <span><strong>Wersja:</strong> ${LEGAL_DOC_VERSIONS.terms}</span>
  </div>

  <h2>1. Postanowienia ogólne</h2>
  <p>1.1. Usługodawcą jest <strong>{{company_name}}</strong>, prowadząca działalność gospodarczą pod nazwą <strong>{{company_name}}</strong>, NIP <strong>{{company_tax_id}}</strong>, adres siedziby <strong>{{company_address}}</strong>, adres e-mail: <strong>{{company_email}}</strong> (dalej: „Usługodawca” lub „PhotoCloud”).</p>
  <p>1.2. Usługa PhotoCloud (dalej: „Usługa”) polega na udostępnianiu platformy internetowej umożliwiającej fotografom tworzenie prywatnych galerii zdjęć online, udostępnianie ich klientom, selekcję zdjęć przez klientów oraz pobieranie plików.</p>
  <p>1.3. Korzystanie z Usługi wymaga akceptacji niniejszego Regulaminu oraz Polityki Prywatności.</p>
  <p>1.4. Usługa jest skierowana zarówno do przedsiębiorców, jak i konsumentów. Postanowienia dotyczące konsumentów stosuje się wyłącznie do osób fizycznych dokonujących czynności prawnej niezwiązanej bezpośrednio z ich działalnością gospodarczą lub zawodową (zob. art. 22¹ Kodeksu cywilnego).</p>

  <h2>2. Definicje</h2>
  <ul>
    <li><strong>Konto</strong> – konto użytkownika w systemie PhotoCloud przypisane do fotografa.</li>
    <li><strong>Galeria</strong> – prywatna przestrzeń online utworzona przez fotografa, zawierająca zdjęcia.</li>
    <li><strong>Klient</strong> – osoba, której fotograf udostępnia dostęp do Galerii (nie musi posiadać Konta).</li>
    <li><strong>Opłata</strong> – jednorazowa opłata za utworzenie Galerii w wybranym Pakiecie.</li>
    <li><strong>Pakiet</strong> – jeden z trzech planów: Small (4 zł), Medium (7 zł), Large (8 zł) – określający limit miejsca na zdjęcia oryginalne i finalne.</li>
    <li><strong>Portfel</strong> – wirtualne saldo w Koncie fotografa, które może być doładowane i wykorzystane na Opłaty za Galerie.</li>
    <li><strong>Doładowanie Portfela</strong> – wpłata środków na Portfel w celu późniejszego wykorzystania na Opłaty.</li>
  </ul>

  <h2>3. Rejestracja i Konto</h2>
  <p>3.1. Rejestracja jest dobrowolna i możliwa poprzez formularz na stronie.</p>
  <p>3.2. Użytkownik zobowiązuje się podawać prawdziwe dane.</p>
  <p>3.3. Konto jest osobiste i nie może być udostępniane osobom trzecim.</p>
  <p>3.4. Usługodawca może zablokować lub usunąć Konto w przypadku naruszenia Regulaminu (np. spam, naruszenie praw autorskich, oszustwa).</p>

  <h2>4. Tworzenie i prowadzenie Galerii</h2>
  <p>4.1. Po dokonaniu Opłaty za wybrany Pakiet (bezpośrednio kartą/przelewem lub z salda Portfela), fotograf może utworzyć Galerię i przesłać zdjęcia.</p>
  <p>4.2. Limity miejsca:</p>
  <ul>
    <li>Small: 1 GB oryginałów + 1 GB finalnych plików</li>
    <li>Medium: 3 GB oryginałów + 3 GB finalnych plików</li>
    <li>Large: 10 GB oryginałów + 10 GB finalnych plików</li>
  </ul>
  <p>4.3. Zdjęcia oryginalne są automatycznie usuwane z serwera po oznaczeniu przez fotografa zamówienia jako „dostarczone” (delivery). Zdjęcia finalne oraz miniatury pozostają dostępne bezterminowo.</p>
  <p>4.4. Fotograf ponosi wyłączną odpowiedzialność za treści przesyłane do Galerii (prawa autorskie, zgody osób utrwalonych).</p>
  <p>4.5. Usługodawca nie ponosi odpowiedzialności za utratę danych z przyczyn leżących po stronie fotografa lub klienta.</p>

  <h2>5. Dostęp klienta do Galerii</h2>
  <p>5.1. Dostęp do Galerii jest zabezpieczony hasłem lub linkiem prywatnym.</p>
  <p>5.2. Klient może przeglądać, wybierać i pobierać zdjęcia zgodnie z uprawnieniami nadanymi przez fotografa.</p>
  <p>5.3. PhotoCloud nie pośredniczy w relacjach handlowych między fotografem a klientem.</p>

  <h2>6. Płatności i Portfel</h2>
  <p>6.1. Opłaty za Galerie są jednorazowe i pobierane z góry.</p>
  <p>6.2. Dostępne metody płatności: <strong>[lista metod – np. BLIK, karta płatnicza, Przelewy24, Apple Pay, Google Pay, PayPal]</strong>.</p>

  <h3>6.3. Portfel</h3>
  <p>6.3.1. Użytkownik może doładować Portfel dowolną kwotą (minimalna kwota doładowania: 10 zł).</p>
  <p>6.3.2. Środki wpłacone na Portfel są przeznaczone wyłącznie na Opłaty za tworzenie Galerii w ramach Usługi.</p>
  <p>6.3.3. <strong>Saldo Portfela jest bezzwrotne</strong> – nie podlega zwrotowi w gotówce ani przeniesieniu na inne konto.</p>
  <p>6.3.4. W przypadku rozwiązania umowy lub usunięcia Konta przez Użytkownika niewykorzystane środki na Portfelu ulegają przepadkowi i nie podlegają zwrotowi.</p>
  <p>6.3.5. Doładowanie Portfela nie jest traktowane jako przedpłata na konkretną usługę, lecz jako zakup wewnętrznego środka płatniczego w ramach Usługi.</p>

  <p>6.4. Faktury VAT wystawiane są elektronicznie na podany adres e-mail (również za doładowania Portfela).</p>
  <p>6.5. W przypadku odstąpienia od umowy przez konsumenta w ciągu 14 dni (prawo do odstąpienia od umowy zawartej na odległość):</p>
  <ul>
    <li>zwrot dotyczy wyłącznie Opłat za Galerie, które nie zostały jeszcze utworzone,</li>
    <li>doładowania Portfela są niezwrotne (wyjątek od prawa odstąpienia – art. 38 pkt 13 ustawy o prawach konsumenta – świadczenie w pełni wykonane za wyraźną zgodą konsumenta przed upływem terminu odstąpienia).</li>
  </ul>

  <h3>6.6. Program „Zaproszenia i nagrody”</h3>
  <p>6.6.1. Użytkownik, który dokonał co najmniej jednej udanej płatności Stripe (Opłata za Galerię, upgrade planu lub doładowanie Portfela), może uczestniczyć w programie „Zaproszenia i nagrody” i udostępniać osobisty link zaproszenia.</p>
  <p>6.6.2. Osoba, która założy Konto poprzez link zaproszenia, ma Konto powiązane z zaproszeniem (soft-link). Zapraszający otrzymuje nagrodę (kod rabatowy, darmowa galeria lub doładowanie Portfela – zgodnie z tabelą nagród w panelu), gdy zaproszona osoba po raz pierwszy opłaci Galerię lub doładuje Portfel (płatność realna, poprzez STRIPE). Przy pierwszej płatności zaproszonej osoby kod rabatowy nie jest wymagany – zniżka za link polecający nalicza się automatycznie, ponieważ powiązanie wynika z rejestracji przez link.</p>
  <p>6.6.3. Nagrody (kody rabatowe, darmowa galeria, doładowanie Portfela) są przyznawane według zasad opublikowanych w panelu. Kody rabatowe obowiązują na wybrane plany i przez określony czas. Doładowanie Portfela w ramach nagrody (np. 20 PLN za 10. zaproszenie) podlega tym samym zasadom co Portfel (pkt 6.3).</p>
  <p>6.6.4. Usługodawca zastrzega prawo zmiany lub zakończenia programu „Zaproszenia i nagrody” z zachowaniem już przyznanych nagród.</p>

  <h2>7. Prawo odstąpienia od umowy (dla konsumentów)</h2>
  <p>7.1. Konsument ma prawo odstąpić od umowy w terminie 14 dni bez podania przyczyny.</p>
  <p>7.2. Termin biegnie od dnia zawarcia umowy (utworzenia pierwszej Galerii lub doładowania Portfela).</p>
  <p>7.3. Aby odstąpić, wystarczy wysłać oświadczenie (np. e-mail).</p>
  <p>7.4. Usługodawca zwraca wszystkie otrzymane płatności w ciągu 14 dni – z wyjątkiem doładowań Portfela (zob. pkt 6.5).</p>
  <p>7.5. Prawo odstąpienia nie przysługuje, jeśli usługa została w pełni wykonana za wyraźną zgodą konsumenta przed upływem 14 dni (art. 38 pkt 13 ustawy o prawach konsumenta).</p>

  <h2>8. Reklamacje</h2>
  <p>8.1. Użytkownik może zgłaszać reklamacje dotyczące Usługi na adres e-mail: <strong>{{company_email}}</strong> w terminie 30 dni od wystąpienia problemu.</p>
  <p>8.2. Reklamacja powinna zawierać opis problemu, dane Użytkownika oraz dowód zakupu (jeśli dotyczy).</p>
  <p>8.3. Usługodawca rozpatruje reklamację w terminie 14 dni. Jeśli reklamacja jest uzasadniona, Usługodawca może zwrócić Opłatę lub udzielić rabatu na przyszłe Galerie.</p>
  <p>8.4. W przypadku konsumentów, reklamacje rozpatrywane są zgodnie z ustawą o prawach konsumenta.</p>

  <h2>9. Odpowiedzialność</h2>
  <p>9.1. Usługodawca nie ponosi odpowiedzialności za:</p>
  <ul>
    <li>utratę danych z przyczyn niezależnych od Usługodawcy (np. awarie techniczne po stronie Użytkownika),</li>
    <li>naruszenia praw autorskich lub innych praw przez użytkowników,</li>
    <li>przerwy w dostępności Usługi spowodowane siłą wyższą lub pracami konserwacyjnymi.</li>
  </ul>
  <p>9.2. Maksymalna odpowiedzialność Usługodawcy wobec konsumenta nie przekracza wartości ostatniej Opłaty uiszczonej przez Użytkownika.</p>
  <p>9.3. Usługodawca nie ponosi odpowiedzialności za szkody pośrednie lub utracone korzyści.</p>

  <h2>10. Prawo właściwe i rozstrzyganie sporów</h2>
  <p>10.1. Niniejszy Regulamin podlega prawu polskiemu.</p>
  <p>10.2. W sprawach nieuregulowanych stosuje się przepisy Kodeksu cywilnego, ustawy o prawach konsumenta, ustawy o świadczeniu usług drogą elektroniczną oraz RODO.</p>
  <p>10.3. Spory z konsumentami rozstrzyga sąd właściwy według przepisów Kodeksu postępowania cywilnego (miejsce zamieszkania konsumenta).</p>
  <p>10.4. Konsument może skorzystać z pozasądowych metod rozstrzygania sporów (np. mediacja przy UOKiK lub platforma ODR UE: ec.europa.eu/odr).</p>

  <h2>11. Postanowienia końcowe</h2>
  <p>11.1. Regulamin wchodzi w życie z dniem <strong>{{legal_document_publication_date}}</strong>.</p>
  <p>11.2. Usługodawca zastrzega prawo zmiany Regulaminu – zmiany wchodzą w życie po 14 dniach od publikacji na stronie (z wyjątkiem zmian korzystnych dla Użytkownika – wchodzą natychmiast). Użytkownik zostanie powiadomiony o zmianach e-mailem.</p>
  <p>11.3. Jeśli zmiana Regulaminu jest istotna i niekorzystna dla Użytkownika, konsument ma prawo odstąpienia od umowy w terminie 14 dni od powiadomienia.</p>
  <p class="legal-note"><strong>Polityka Prywatności:</strong> Pełna Polityka Prywatności dostępna jest na stronie LANDING (link w stopce). Korzystając z Usługi, w tym dokonując pierwszej rejestracji, doładowania Portfela lub utworzenia Galerii, potwierdzasz zapoznanie się i akceptację niniejszego Regulaminu.</p>
`;

