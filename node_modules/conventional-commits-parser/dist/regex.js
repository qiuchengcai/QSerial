const nomatchRegex = /(?!.*)/;
function escape(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function join(parts, joiner) {
    return parts
        .map(val => escape(val.trim()))
        .filter(Boolean)
        .join(joiner);
}
function getNotesRegex(noteKeywords, notesPattern) {
    if (!noteKeywords) {
        return nomatchRegex;
    }
    const noteKeywordsSelection = join(noteKeywords, '|');
    if (!notesPattern) {
        return new RegExp(`^[\\s|*]*(${noteKeywordsSelection})[:\\s]+(.*)`, 'i');
    }
    return notesPattern(noteKeywordsSelection);
}
function getReferencePartsRegex(issuePrefixes, issuePrefixesCaseSensitive) {
    if (!issuePrefixes) {
        return nomatchRegex;
    }
    const flags = issuePrefixesCaseSensitive ? 'g' : 'gi';
    return new RegExp(`(?:.*?)??\\s*([\\w-\\.\\/]*?)??(${join(issuePrefixes, '|')})([\\w-]+)(?=\\s|$|[,;)\\]])`, flags);
}
function getReferencesRegex(referenceActions) {
    if (!referenceActions) {
        // matches everything
        return /()(.+)/gi;
    }
    const joinedKeywords = join(referenceActions, '|');
    return new RegExp(`(${joinedKeywords})(?:\\s+(.*?))(?=(?:${joinedKeywords})|$)`, 'gi');
}
/**
 * Make the regexes used to parse a commit.
 * @param options
 * @returns Regexes.
 */
export function getParserRegexes(options = {}) {
    const notes = getNotesRegex(options.noteKeywords, options.notesPattern);
    const referenceParts = getReferencePartsRegex(options.issuePrefixes, options.issuePrefixesCaseSensitive);
    const references = getReferencesRegex(options.referenceActions);
    return {
        notes,
        referenceParts,
        references,
        mentions: /@([\w-]+)/g,
        url: /\b(?:https?):\/\/(?:www\.)?([-a-zA-Z0-9@:%_+.~#?&//=])+\b/
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVnZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvcmVnZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBS0EsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFBO0FBRTdCLFNBQVMsTUFBTSxDQUFDLE1BQWM7SUFDNUIsT0FBTyxNQUFNLENBQUMsT0FBTyxDQUFDLHFCQUFxQixFQUFFLE1BQU0sQ0FBQyxDQUFBO0FBQ3RELENBQUM7QUFFRCxTQUFTLElBQUksQ0FBQyxLQUFlLEVBQUUsTUFBYztJQUMzQyxPQUFPLEtBQUs7U0FDVCxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7U0FDOUIsTUFBTSxDQUFDLE9BQU8sQ0FBQztTQUNmLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQTtBQUNqQixDQUFDO0FBRUQsU0FBUyxhQUFhLENBQ3BCLFlBQWtDLEVBQ2xDLFlBQW9EO0lBRXBELElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNsQixPQUFPLFlBQVksQ0FBQTtJQUNyQixDQUFDO0lBRUQsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxDQUFBO0lBRXJELElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNsQixPQUFPLElBQUksTUFBTSxDQUFDLGFBQWEscUJBQXFCLGNBQWMsRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUMxRSxDQUFDO0lBRUQsT0FBTyxZQUFZLENBQUMscUJBQXFCLENBQUMsQ0FBQTtBQUM1QyxDQUFDO0FBRUQsU0FBUyxzQkFBc0IsQ0FDN0IsYUFBbUMsRUFDbkMsMEJBQStDO0lBRS9DLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNuQixPQUFPLFlBQVksQ0FBQTtJQUNyQixDQUFDO0lBRUQsTUFBTSxLQUFLLEdBQUcsMEJBQTBCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFBO0lBRXJELE9BQU8sSUFBSSxNQUFNLENBQUMsbUNBQW1DLElBQUksQ0FBQyxhQUFhLEVBQUUsR0FBRyxDQUFDLDhCQUE4QixFQUFFLEtBQUssQ0FBQyxDQUFBO0FBQ3JILENBQUM7QUFFRCxTQUFTLGtCQUFrQixDQUN6QixnQkFBc0M7SUFFdEMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDdEIscUJBQXFCO1FBQ3JCLE9BQU8sVUFBVSxDQUFBO0lBQ25CLENBQUM7SUFFRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFFbEQsT0FBTyxJQUFJLE1BQU0sQ0FBQyxJQUFJLGNBQWMsdUJBQXVCLGNBQWMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQ3hGLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLGdCQUFnQixDQUM5QixVQUFzSSxFQUFFO0lBRXhJLE1BQU0sS0FBSyxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQTtJQUN2RSxNQUFNLGNBQWMsR0FBRyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQyxDQUFBO0lBQ3hHLE1BQU0sVUFBVSxHQUFHLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFBO0lBRS9ELE9BQU87UUFDTCxLQUFLO1FBQ0wsY0FBYztRQUNkLFVBQVU7UUFDVixRQUFRLEVBQUUsWUFBWTtRQUN0QixHQUFHLEVBQUUsMkRBQTJEO0tBQ2pFLENBQUE7QUFDSCxDQUFDIn0=