/**
 * Convert number to Indian currency words
 * @param {number} n 
 * @returns {string}
 */
export const numberToWords = (n) => {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    if (n === 0) return 'Zero Rupees Only';
    if (!n) return '';

    const tw = (num) => {
        if (num < 20) return a[num];
        if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? ' ' + a[num % 10] : '');
        if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + tw(num % 100) : '');
        if (num < 100000) return tw(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + tw(num % 1000) : '');
        if (num < 10000000) return tw(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + tw(num % 100000) : '');
        return tw(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + tw(num % 10000000) : '');
    };

    const whole = Math.floor(n);
    const paise = Math.round((n - whole) * 100);
    
    let res = tw(whole) + ' Rupees';
    if (paise > 0) {
        res += ' and ' + tw(paise) + ' Paise';
    }
    return res + ' Only';
};
