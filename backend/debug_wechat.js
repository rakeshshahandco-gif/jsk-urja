import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// We need to find the ChinaSupplierProduct model
// It might be in backend/src/features/wechat/models/ ?
// Or backend/src/models/wechatProduct.model.js ?

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));
        
        // Let's guess the name
        const WeChatProduct = mongoose.model('WeChatProduct', new mongoose.Schema({}, { strict: false }));
        const search = 'JUTDS';
        const items = await WeChatProduct.find({ 
            $or: [
                { productName: { $regex: search, $options: 'i' } },
                { productCode: { $regex: search, $options: 'i' } }
            ]
        }).lean();
        
        console.log(`Found ${items.length} WeChat products matching "${search}":`);
        console.log(JSON.stringify(items, null, 2));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
