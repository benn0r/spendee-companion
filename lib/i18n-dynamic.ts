type Locale = "pt-BR" | "fr" | "it";

type Forms = [singular: string, plural: string];
type DynamicConfig = {
  nouns: Record<"transaction" | "wallet" | "category" | "duplicate" | "split" | "column", Forms>;
  selectedTransactions: Forms;
  customPositions: Forms;
  activeTransactions: Forms;
  selection: (selected: string, total: string) => string;
  proposedChanges: Forms;
  separatedDuplicates: Forms;
  deletedDuplicates: Forms;
  approvedItems: Forms;
  rejectedItems: Forms;
  deleteSelected: (count: string) => string;
  splitSelected: (count: string) => string;
  matches: (id: string) => string;
  positionDescription: (index: string) => string;
  positionAmount: (index: string) => string;
  removePosition: (index: string) => string;
  removeNamed: (name: string) => string;
  selectedCategories: (names: string) => string;
  startingAmount: (currency: string) => string;
  selectDuplicate: (id: string) => string;
  selectTransaction: (id: string) => string;
  categoryIcon: (id: string) => string;
  pieChart: (currency: string) => string;
  repeatedWallet: (wallet: string) => string;
  deleteTitle: (title: string) => string;
  deleteDuplicates: Forms;
  verifiedThrough: (date: string) => string;
  verificationCleared: string;
  importSummary: (files: string, imported: string, duplicates: string) => string;
  page: (page: string, pages: string) => string;
  range: (from: string, to: string, total: string) => string;
};

const configs: Record<Locale, DynamicConfig> = {
  "pt-BR": {
    nouns: { transaction: ["transação", "transações"], wallet: ["carteira", "carteiras"], category: ["categoria", "categorias"], duplicate: ["duplicata", "duplicatas"], split: ["rateio", "rateios"], column: ["coluna", "colunas"] },
    selectedTransactions: ["transação selecionada", "transações selecionadas"],
    customPositions: ["item personalizado", "itens personalizados"],
    activeTransactions: ["transação ativa", "transações ativas"],
    selection: (selected, total) => `${selected} de ${total} selecionados`,
    proposedChanges: ["alteração proposta precisa da sua revisão", "alterações propostas precisam da sua revisão"],
    separatedDuplicates: ["duplicata separada", "duplicatas separadas"],
    deletedDuplicates: ["duplicata excluída.", "duplicatas excluídas."],
    approvedItems: ["item pendente aprovado.", "itens pendentes aprovados."],
    rejectedItems: ["item pendente rejeitado.", "itens pendentes rejeitados."],
    deleteSelected: (count) => `Excluir selecionados (${count})`,
    splitSelected: (count) => `Ratear selecionadas (${count})`,
    matches: (id) => `corresponde a #${id}`,
    positionDescription: (index) => `Descrição do item ${index}`,
    positionAmount: (index) => `Valor do item ${index}`,
    removePosition: (index) => `Remover item ${index}`,
    removeNamed: (name) => `Remover ${name}`,
    selectedCategories: (names) => `Categorias selecionadas: ${names}`,
    startingAmount: (currency) => `Saldo inicial em ${currency}`,
    selectDuplicate: (id) => `Selecionar duplicata ${id}`,
    selectTransaction: (id) => `Selecionar transação ${id}`,
    categoryIcon: (id) => `Ícone da categoria ${id}`,
    pieChart: (currency) => `Gráfico de pizza de gastos em ${currency}`,
    repeatedWallet: (wallet) => `A carteira “${wallet}” aparece em mais de um arquivo de importação completa.`,
    deleteTitle: (title) => `Excluir “${title}”? Esta ação não pode ser desfeita.`,
    deleteDuplicates: ["duplicata selecionada? Esta ação não pode ser desfeita.", "duplicatas selecionadas? Esta ação não pode ser desfeita."],
    verifiedThrough: (date) => `As transações até ${date} estão marcadas como verificadas.`,
    verificationCleared: "A data de verificação das transações foi removida.",
    importSummary: (files, imported, duplicates) => `${files} arquivos processados · ${imported} importados · ${duplicates} duplicatas separadas`,
    page: (page, pages) => `Página ${page} de ${pages}`,
    range: (from, to, total) => `${from}–${to} de ${total}`,
  },
  fr: {
    nouns: { transaction: ["transaction", "transactions"], wallet: ["portefeuille", "portefeuilles"], category: ["catégorie", "catégories"], duplicate: ["doublon", "doublons"], split: ["répartition", "répartitions"], column: ["colonne", "colonnes"] },
    selectedTransactions: ["transaction sélectionnée", "transactions sélectionnées"],
    customPositions: ["élément personnalisé", "éléments personnalisés"],
    activeTransactions: ["transaction active", "transactions actives"],
    selection: (selected, total) => `${selected} sur ${total} sélectionnés`,
    proposedChanges: ["modification proposée à vérifier", "modifications proposées à vérifier"],
    separatedDuplicates: ["doublon séparé", "doublons séparés"],
    deletedDuplicates: ["doublon supprimé.", "doublons supprimés."],
    approvedItems: ["élément en attente approuvé.", "éléments en attente approuvés."],
    rejectedItems: ["élément en attente rejeté.", "éléments en attente rejetés."],
    deleteSelected: (count) => `Supprimer la sélection (${count})`,
    splitSelected: (count) => `Répartir la sélection (${count})`,
    matches: (id) => `correspond au no ${id}`,
    positionDescription: (index) => `Description de l’élément ${index}`,
    positionAmount: (index) => `Montant de l’élément ${index}`,
    removePosition: (index) => `Supprimer l’élément ${index}`,
    removeNamed: (name) => `Supprimer ${name}`,
    selectedCategories: (names) => `Catégories sélectionnées : ${names}`,
    startingAmount: (currency) => `Montant initial en ${currency}`,
    selectDuplicate: (id) => `Sélectionner le doublon ${id}`,
    selectTransaction: (id) => `Sélectionner la transaction ${id}`,
    categoryIcon: (id) => `Icône de catégorie ${id}`,
    pieChart: (currency) => `Diagramme circulaire des dépenses en ${currency}`,
    repeatedWallet: (wallet) => `Le portefeuille « ${wallet} » figure dans plusieurs fichiers d’importation complète.`,
    deleteTitle: (title) => `Supprimer « ${title} » ? Cette action est irréversible.`,
    deleteDuplicates: ["doublon sélectionné ? Cette action est irréversible.", "doublons sélectionnés ? Cette action est irréversible."],
    verifiedThrough: (date) => `Les transactions jusqu’au ${date} sont marquées comme vérifiées.`,
    verificationCleared: "La date de vérification des transactions a été supprimée.",
    importSummary: (files, imported, duplicates) => `${files} fichiers traités · ${imported} importés · ${duplicates} doublons séparés`,
    page: (page, pages) => `Page ${page} sur ${pages}`,
    range: (from, to, total) => `${from}–${to} sur ${total}`,
  },
  it: {
    nouns: { transaction: ["transazione", "transazioni"], wallet: ["portafoglio", "portafogli"], category: ["categoria", "categorie"], duplicate: ["duplicato", "duplicati"], split: ["ripartizione", "ripartizioni"], column: ["colonna", "colonne"] },
    selectedTransactions: ["transazione selezionata", "transazioni selezionate"],
    customPositions: ["voce personalizzata", "voci personalizzate"],
    activeTransactions: ["transazione attiva", "transazioni attive"],
    selection: (selected, total) => `${selected} di ${total} selezionati`,
    proposedChanges: ["modifica proposta da controllare", "modifiche proposte da controllare"],
    separatedDuplicates: ["duplicato separato", "duplicati separati"],
    deletedDuplicates: ["duplicato eliminato.", "duplicati eliminati."],
    approvedItems: ["elemento in sospeso approvato.", "elementi in sospeso approvati."],
    rejectedItems: ["elemento in sospeso rifiutato.", "elementi in sospeso rifiutati."],
    deleteSelected: (count) => `Elimina selezionati (${count})`,
    splitSelected: (count) => `Ripartisci selezionate (${count})`,
    matches: (id) => `corrisponde al n. ${id}`,
    positionDescription: (index) => `Descrizione della voce ${index}`,
    positionAmount: (index) => `Importo della voce ${index}`,
    removePosition: (index) => `Rimuovi la voce ${index}`,
    removeNamed: (name) => `Rimuovi ${name}`,
    selectedCategories: (names) => `Categorie selezionate: ${names}`,
    startingAmount: (currency) => `Importo iniziale in ${currency}`,
    selectDuplicate: (id) => `Seleziona il duplicato ${id}`,
    selectTransaction: (id) => `Seleziona la transazione ${id}`,
    categoryIcon: (id) => `Icona categoria ${id}`,
    pieChart: (currency) => `Grafico a torta delle spese in ${currency}`,
    repeatedWallet: (wallet) => `Il portafoglio «${wallet}» compare in più file di importazione completa.`,
    deleteTitle: (title) => `Eliminare «${title}»? Questa operazione non può essere annullata.`,
    deleteDuplicates: ["duplicato selezionato? Questa operazione non può essere annullata.", "duplicati selezionati? Questa operazione non può essere annullata."],
    verifiedThrough: (date) => `Le transazioni fino al ${date} sono contrassegnate come verificate.`,
    verificationCleared: "La data di verifica delle transazioni è stata rimossa.",
    importSummary: (files, imported, duplicates) => `${files} file elaborati · ${imported} importati · ${duplicates} duplicati separati`,
    page: (page, pages) => `Pagina ${page} di ${pages}`,
    range: (from, to, total) => `${from}–${to} di ${total}`,
  },
};

function form(forms: Forms, count: string) {
  return forms[Number(count) === 1 ? 0 : 1];
}

export function translateDynamicUi(locale: Locale, text: string): string {
  const c = configs[locale];
  let match = text.match(/^(\d+) (transaction|transactions|wallet|wallets|category|categories|duplicate|duplicates|split|splits|column|columns)$/);
  if (match) {
    const kind = ({ transactions: "transaction", wallets: "wallet", categories: "category", duplicates: "duplicate", splits: "split", columns: "column" } as Record<string, keyof DynamicConfig["nouns"]>)[match[2]] ?? match[2] as keyof DynamicConfig["nouns"];
    return `${match[1]} ${form(c.nouns[kind], match[1])}`;
  }
  match = text.match(/^(\d+) selected transactions?$/);
  if (match) return `${match[1]} ${form(c.selectedTransactions, match[1])}`;
  match = text.match(/^(· )?(\d+) custom positions?$/);
  if (match) return `${match[1] ?? ""}${match[2]} ${form(c.customPositions, match[2])}`;
  match = text.match(/^(\d+) active transactions?$/);
  if (match) return `${match[1]} ${form(c.activeTransactions, match[1])}`;
  match = text.match(/^(\d+) of (\d+) selected$/);
  if (match) return c.selection(match[1], match[2]);
  match = text.match(/^(\d+) proposed changes? need(?:s)? your review$/);
  if (match) return `${match[1]} ${form(c.proposedChanges, match[1])}`;
  match = text.match(/^(\d+) separated duplicates?$/);
  if (match) return `${match[1]} ${form(c.separatedDuplicates, match[1])}`;
  match = text.match(/^(\d+) duplicates? deleted\.$/);
  if (match) return `${match[1]} ${form(c.deletedDuplicates, match[1])}`;
  match = text.match(/^(\d+) pending items? (approved|rejected)\.$/);
  if (match) return `${match[1]} ${form(match[2] === "approved" ? c.approvedItems : c.rejectedItems, match[1])}`;
  match = text.match(/^Delete selected \((\d+)\)$/); if (match) return c.deleteSelected(match[1]);
  match = text.match(/^Split selected \((\d+)\)$/); if (match) return c.splitSelected(match[1]);
  match = text.match(/^matches #(\d+)$/); if (match) return c.matches(match[1]);
  match = text.match(/^Position (\d+) description$/); if (match) return c.positionDescription(match[1]);
  match = text.match(/^Position (\d+) amount$/); if (match) return c.positionAmount(match[1]);
  match = text.match(/^Remove position (\d+)$/); if (match) return c.removePosition(match[1]);
  match = text.match(/^Remove (.+)$/); if (match) return c.removeNamed(match[1]);
  match = text.match(/^Selected categories: (.+)$/); if (match) return c.selectedCategories(match[1]);
  match = text.match(/^Starting amount in (.+)$/); if (match) return c.startingAmount(match[1]);
  match = text.match(/^Select duplicate (\d+)$/); if (match) return c.selectDuplicate(match[1]);
  match = text.match(/^Select transaction (\d+)$/); if (match) return c.selectTransaction(match[1]);
  match = text.match(/^Category icon (\d+)$/); if (match) return c.categoryIcon(match[1]);
  match = text.match(/^(.+) spending pie chart$/); if (match) return c.pieChart(match[1]);
  match = text.match(/^Wallet "(.+)" appears in more than one full-import file\.$/); if (match) return c.repeatedWallet(match[1]);
  match = text.match(/^Delete "(.+)"\? This cannot be undone\.$/); if (match) return c.deleteTitle(match[1]);
  match = text.match(/^Delete (\d+) selected duplicates?\? This cannot be undone\.$/);
  if (match) return `${match[1]} ${form(c.deleteDuplicates, match[1])}`;
  match = text.match(/^Transactions through (.+) are marked as verified\.$/); if (match) return c.verifiedThrough(match[1]);
  if (text === "Transaction verification date cleared.") return c.verificationCleared;
  match = text.match(/^(\d+) files? processed · (\d+) imported · (\d+) duplicates? separated$/);
  if (match) return c.importSummary(match[1], match[2], match[3]);
  match = text.match(/^Page (\d+) of (\d+)$/); if (match) return c.page(match[1], match[2]);
  match = text.match(/^(\d+)[–-](\d+) of (\d+)$/); if (match) return c.range(match[1], match[2], match[3]);
  return text;
}
