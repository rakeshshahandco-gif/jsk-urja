import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import distributorService from '../services/distributor.service.js';
import pick from '../utils/pick.js';

const createDistributor = catchAsync(async (req, res) => {
    const distributor = await distributorService.createDistributor(req.body);
    res.status(httpStatus.CREATED).send(distributor);
});

const getDistributors = catchAsync(async (req, res) => {
    const filter = pick(req.query, ['name', 'status']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);
    
    // Support partial name search
    if (filter.name) {
        filter.name = { $regex: filter.name, $options: 'i' };
    }
    
    const result = await distributorService.queryDistributors(filter, options);
    res.send(result);
});

const getDistributor = catchAsync(async (req, res) => {
    const distributor = await distributorService.getDistributorById(req.params.distributorId);
    if (!distributor) {
        res.status(httpStatus.NOT_FOUND).send({ message: 'Distributor not found' });
        return;
    }
    res.send(distributor);
});

const updateDistributor = catchAsync(async (req, res) => {
    const distributor = await distributorService.updateDistributorById(req.params.distributorId, req.body);
    res.send(distributor);
});

const deleteDistributor = catchAsync(async (req, res) => {
    await distributorService.deleteDistributorById(req.params.distributorId);
    res.status(httpStatus.NO_CONTENT).send();
});

export default {
    createDistributor,
    getDistributors,
    getDistributor,
    updateDistributor,
    deleteDistributor,
};
